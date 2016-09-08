/*
Copyright(C) 2014-2016 rtrdprgrmr

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// ==UserScript==
// @name        Automated Keyword Reservation for www.hikaritv.net
// @description	This script automatically make reservations of TV programs which match the keyword you specified.
// @namespace   rtrdprgrmr@yahoo.co.jp
// @copyright	2014-2016, rtrdprgrmr
// @license	MIT License
// @homepageURL	http://akrhikari.blogspot.jp/2014/08/tv.html
// @supportURL	mailto:rtrdprgrmr@yahoo.co.jp
// @include     https://www.hikaritv.net/*
// @grant	GM_getValue
// @grant	GM_setValue
// @grant	GM_deleteValue
// @version     2.00
// ==/UserScript==
//
(function() {
    var onehour = 60 * 60 * 1000;
    var oneday = 24 * onehour;

    // Global Parameters
    var history = 60 * oneday;
    var interval = 1 * onehour;
    var displayTimeout = 2000;
    var clickTimeout = 1000;
    var pollingTimeout = 300;
    var countDownThreshold = 30; // sec

    // Utility functions
    function debug(msg) {
        console.log(msg);
    }

    function LS_getValue(key) {
        return GM_getValue(key, "").toString();
    }

    function LS_putValue(key, value) {
        GM_setValue(key, value.toString());
    }

    function LS_deleteValue(key) {
        GM_deleteValue(key);
    }

    // Hash DB functions
    var T_DB = new load_HDB("T");
    var D_DB = new load_HDB("D");
    var R_DB = new load_HDB("R");

    function load_HDB(type) {
        var header = "H" + type;
        var index = GM_getValue(header + "startindex", 0);
        var keys_index = {};
        while (true) {
            var k = GM_getValue(header + index, 0);
            if (k === 0) {
                break;
            }
            keys_index[k] = index;
            index++;
        }

        this.get = get;
        this.put = put;
        this.clearAll = clearAll;
        this.clearLess = clearLess;
        return this;

        function get(key) {
            if (keys_index[key] === undefined) {
                return 0;
            }
            return GM_getValue(type + key, 0);
        }

        function put(key, value) {
            GM_setValue(type + key, value);
            if (keys_index[key] === undefined) {
                GM_setValue(header + index, key);
                keys_index[key] = index;
                index++;
            }
        }

        function clearAll() {
            while (true) {
                index--;
                var k = GM_getValue(header + index, 0);
                if (k === 0) {
                    break;
                }
                GM_deleteValue(type + k);
                GM_deleteValue(header + index);
            }
            index = 0;
            GM_setValue(header + "startindex", 0);
            keys_index = {};
        }

        function clearLess(threshold) {
            var i = GM_getValue(header + "startindex", 0);
            var startindex = i;
            while (true) {
                var k = GM_getValue(header + i, 0);
                if (k === 0) {
                    break;
                }
                var v = GM_getValue(type + k, 0);
                if (v !== 0 && v < threshold) {
                    if (startindex === i) {
                        startindex++;
                        GM_setValue(header + "startindex", startindex);
                        GM_deleteValue(type + k);
                        GM_deleteValue(header + i);
                        delete keys_index[k];
                    } else {
                        GM_setValue(type + k, 0);
                    }
                }
                i++;
            }
        }
    }

    function gotoPage(url) {
        LS_putValue("expecting", url);
    }

    function isExpectingPage(url) {
        var expecting = LS_getValue("expecting");
        if (expecting == url) {
            LS_deleteValue("expecting");
            return true;
        }
        return false;
    }

    function strip(title) {
        return title.replace(/\s+/g, " ").replace(/^ | $/g, "");
    }

    function stripconv(title) {
        title = title.replace(/\s+/g, " ").replace(/^ | $/g, "");
        title = title.replace(/［/g, "[").replace(/］/g, "]");
        title = title.replace(/（/g, "(").replace(/）/g, ")");
        title = title.replace(/｛/g, "{").replace(/｝/g, "}");
        title = title.replace(/０/g, "0").replace(/１/g, "1");
        title = title.replace(/２/g, "2").replace(/３/g, "3");
        title = title.replace(/４/g, "4").replace(/５/g, "5");
        title = title.replace(/６/g, "6").replace(/７/g, "7");
        title = title.replace(/８/g, "8").replace(/９/g, "9");
        title = title.replace(/！/g, "!").replace(/？/g, '?');
        title = title.replace(/＃/g, "#");
        title = title.replace(/％/g, "%").replace(/＆/g, "&");
        title = title.replace(/￥/g, "¥").replace(/＄/g, "$");
        title = title.replace(/①/g, "[1]");
        title = title.replace(/②/g, "[2]");
        title = title.replace(/③/g, "[3]");
        title = title.replace(/④/g, "[4]");
        title = title.replace(/⑤/g, "[5]");
        title = title.replace(/⑥/g, "[6]");
        title = title.replace(/⑦/g, "[7]");
        title = title.replace(/⑧/g, "[8]");
        title = title.replace(/⑨/g, "[9]");
        return title;
    }

    function encode(title) {
        var coded = "";
        var len = title.length;
        for (var i = 0; i < len; i++) {
            var c = title.charCodeAt(i);
            coded += "_";
            while (c > 0) {
                var x = c % 16;
                coded += String.fromCharCode(65 + x);
                c = (c - x) / 16;
            }
        }
        return coded;
    }

    function decode(coded) {
        var title = "";
        var len = coded.length;
        for (var i = 0; i < len;) {
            if (coded.charAt(i) != '_') {
                break;
            }
            var c = 0;
            var f = 1;
            for (i++; i < len; i++) {
                var x = coded.charCodeAt(i) - 65;
                if (!(0 <= x && x < 16)) {
                    break;
                }
                c += x * f;
                f *= 16;
            }
            title += String.fromCharCode(c);
        }
        return title;
    }

    function parseTimeRange(content) {
        args = content.match(/[0-9]+/g);
        args[0]--; // change the base of month number to zero
        var year = new Date().getFullYear();
        var month = new Date().getMonth();
        if (args[0] + 6 < month) {
            year++;
        }
        if (month + 6 < args[0]) {
            year--;
        }
        var start = new Date(year, args[0], args[1], args[2], args[3]).valueOf();
        var end = new Date(year, args[0], args[1], args[4], args[5]).valueOf();
        if (end < start) {
            end += 24 * 60 * 60 * 1000;
        }
        return [start, end];
    }

    function parseTimeRange2(content) {
        args = content.match(/[0-9]+/g);
        args[1]--; // change the base of month number to zero
        var start = new Date(args[0], args[1], args[2], args[3], args[4]).valueOf();
        var end = new Date(args[0], args[1], args[2], args[5], args[6]).valueOf();
        if (end < start) {
            end += 24 * 60 * 60 * 1000;
        }
        return [start, end];
    }

    function parseChannel(content) {
        args = content.match(/([0-9]+)/);
        return args[1];
    }

    var urlstart = "https://www.hikaritv.net/member/remote/reserve/regist";
    var urllist = "https://www.hikaritv.net/member/remote/reserve/list";
    var urlsearch = "https://www.hikaritv.net/#/search";
    var urlconfirm = "https://www.hikaritv.net/member/remote/reserve/confirm/program";
    var urlcomp = "https://www.hikaritv.net/member/remote/reserve/complete/program";
    var urldelcomp = "https://www.hikaritv.net/member/remote/reserve/delete_complete";
    var urlcancomp = "https://www.hikaritv.net/member/remote/reserve/cancel_complete"; // pseudo URL
    var urlrestart = "https://www.hikaritv.net/member/remote/reserve/restart"; // pseudo URL

    // Main functions
    function parseReservationList() {
        try {
            var table = document.getElementsByTagName("table")[0];
            var list = table.getElementsByTagName("tr");
            for (var i = 1; i < list.length; i++) {
                try {
                    var tds = list[i].getElementsByTagName("td");
                    var range = parseTimeRange(tds[1].textContent);
                    var channo = parseChannel(tds[3].textContent);
                    var start = new Date(range[0]).toISOString();
                    var end = new Date(range[1]).toISOString();
                    var title = tds[2].textContent;
                    title = stripconv(title);
                    var state = tds[4].textContent;
                    if (state.indexOf("○") >= 0) {
                        var code = encode(title);
                        R_DB.put(code, range[0]);
                        T_DB.put(range[0] + range[1] + channo, 3);
                    } else if (state.indexOf("−") >= 0) {
                        var code = encode(title);
                        T_DB.put(code, 1);
                    } else if (state.indexOf("×") >= 0) {
                        D_DB.put(range[0] + range[1] + channo, 3);
                    } else {
                        console.log("UNKNOWN STATE:" + state + ":" + title);
                    }
                } catch (e) {
                    console.log("EXCEPTION:parseReservationList:" + e);
                }
            }
        } catch (e) {
            console.log("EXCEPTION:parseReservationList:" + e);
        }
    }

    function nextList() {
        try {
            debug("nextList");
            var p = document.getElementsByClassName("next")[0];
            var href = p.getElementsByTagName("a")[0].href;
            setTimeout(function() {
                gotoPage(urllist);
                location.href = href;
            }, clickTimeout);
            return;
        } catch (e) {
            debug("no next list");
        }
        nextKeyword();
    }

    function checkTitlePre(title) {
        var keywordIndex = parseInt(LS_getValue("indexOfKeywords"));
        var exceptREX = new RegExp(stripconv(LS_getValue("except" + keywordIndex)), "i");
        var code = encode(title);
        if (R_DB.get(code) !== 0) {
            console.log("reserved:" + title);
            return false;
        }
        if (T_DB.get(code) !== 0) {
            console.log("reserving:" + title);
            return false;
        }
        if (exceptREX.test(title) && exceptREX.exec(title)[0].length > 0) {
            console.log("except:" + title)
            return false;
        }
        return true;
    }

    function checkTitle(title, range, genre, channel, isPremium) {
        var keywordIndex = parseInt(LS_getValue("indexOfKeywords"));
        var genreREX = new RegExp(stripconv(LS_getValue("genre" + keywordIndex)), "i");
        var channelREX = new RegExp(channel_source = stripconv(LS_getValue("channel" + keywordIndex)), "i");
        var exceptREX = new RegExp(stripconv(LS_getValue("except" + keywordIndex)), "i");
        var channel_source;
        var channo = parseChannel(channel);
        var code = encode(title);
        if (isPremium && !channel_source) {
            console.log("premium:" + title);
            return false;
        }
        if (!genreREX.test(genre)) {
            console.log("not genre:" + title)
            return false;
        }
        if (!channelREX.test(channel)) {
            console.log("not channel:" + title)
            return false;
        }
        if (R_DB.get(code) !== 0) {
            console.log("reserved:" + title);
            return false;
        }
        if (T_DB.get(code) !== 0) {
            console.log("reserving:" + title);
            return false;
        }
        if (T_DB.get(range[0] + range[1] + channo) !== 0) {
            console.log("reserving(in another name):" + title);
            return false;
        }
        if (D_DB.get(range[0] + range[1] + channo) !== 0) {
            console.log("conflict:" + title);
            return false;
        }
        if (!checkDate(range[0], title)) {
            console.log("days:" + title)
            return false;
        }
        T_DB.put(code, 2);
        return true;
    }

    function checkDate(start) {
        var days = parseInt(LS_getValue("akr_days")) + 1;
        if (!(1 <= days && days <= 7)) {
            days = 1;
        }
        var lookahead = days * oneday;
        var now = Date.now();
        if (now + lookahead < start) {
            return false;
        }
        return true;
    }

    var expandSearchResultCount = 0;

    function parseSearchResult() {
        try {
            var div_tab_tv = document.getElementById("tab-tv");
            var ul = div_tab_tv.getElementsByClassName("search-list")[0];
            if (!ul) {
                if (document.getElementsByClassName("seach-error")[0]) {
                    nextKeyword();
                    return;
                }
                setTimeout(parseSearchResult, pollingTimeout);
                return;
            }
            var wall = div_tab_tv.getElementsByClassName("search-result-wall")[0];
            var inp = wall.getElementsByTagName("input")[0];
            if (inp.value == "さらに表示する" &&
                Array.prototype.indexOf.call(inp.classList, "js-hide") < 0 &&
                ++expandSearchResultCount <= 10) {
                debug("expand search result")
                setTimeout(function() {
                    inp.click();
                    setTimeout(parseSearchResult, displayTimeout);
                }, clickTimeout);
                return;
            }

            var list = ul.getElementsByTagName("li");
            var titles = [];
            for (var i = 0; i < list.length; i++) {
                var title = stripconv(list[i].textContent);
                var crid = list[i].getAttribute("data-href").split('&')[1]
                if (!crid || !title) continue;
                titles.push(title);
                titles.push(crid);
            }
            parseSearchDetail(titles);
        } catch (e) {
            console.log("EXCEPTION:parseSearchResult:" + e);
        }
    }

    function parseSearchDetail(titles) {
        while (true) {
            var title = titles.shift();
            var crid = titles.shift();
            if (!crid) {
                nextKeyword();
                return;
            }
            if (!checkTitlePre(title)) {
                continue;
            }
            setTimeout(function() {
                location.href = "#/tv/detail/" + crid;
                setTimeout(parser, displayTimeout);
            }, clickTimeout);
            return;
        }

        function parser() {
            var ctts = document.getElementById("tvDetail-ctts");
            if (!ctts) {
                setTimeout(parser, pollingTimeout);
                return;
            }
            var section = ctts.getElementsByTagName("section")[0];
            if (!section) {
                var div = ctts.getElementsByClassName("error-report")[0];
                if (div) {
                    console.log("not found:" + title);
                    debug(div.textContent)
                    parseSearchDetail(titles);
                    return;
                }
                setTimeout(parser, pollingTimeout);
                return;
            }
            var record_area = section.getElementsByClassName("record_area")[0];
            var record_area_a = record_area.getElementsByTagName("a")[0];
            if (!record_area_a) {
                console.log("not recordable:" + title);
                parseSearchDetail(titles);
                return;
            }
            var crid1 = record_area_a.getAttribute("data-crid");
            if (crid != crid1) {
                setTimeout(parser, pollingTimeout);
                return;
            }
            if (strip(record_area.textContent) != "録画予約") {
                console.log("not recordable:" + title);
                parseSearchDetail(titles);
                return;
            }
            var h3 = ctts.getElementsByClassName("mdConts_tabInner_title")[0];
            var table = section.getElementsByTagName("table")[0];
            var tds = section.getElementsByTagName("td");
            var title1 = stripconv(h3.textContent);
            var range = parseTimeRange2(tds[0].textContent);
            var genre = stripconv(tds[1].textContent);
            var channel = stripconv(tds[2].textContent);
            if (title != title1) {
                debug("UNEXPECTED: " + title1 + " EXPECTED: " + title);
            }
            var attrs1 = section.getElementsByClassName("mdConts-attibute")[0];
            var attrs = attrs1.children[0].children;
            for (attr of attrs) {
                if (attr.textContent == "プレミアムチャンネル") {
                    var isPremium = true;
                }
            }
            if (!checkTitle(title, range, genre, channel, isPremium)) {
                parseSearchDetail(titles);
                return;
            }
            var start = new Date(range[0]).toISOString();
            console.log("going to reserve:" + start + " " + title);
            setTimeout(function() {
                record_area_a.click();
                setTimeout(confirm_reservation, displayTimeout);
            }, clickTimeout);
        }

        function confirm_reservation() {
            var ctts = document.getElementById("tvReserveRecordingConfirm-ctts");
            if (!ctts) {
                setTimeout(confirm_reservation, pollingTimeout);
                return;
            }
            var btn = document.getElementsByClassName("btn-remote-reserve-rec")[0];
            var btn_a = btn.getElementsByTagName("a")[0];
            setTimeout(function() {
                debug("confirming");
                btn_a.click();
                setTimeout(wait_complete_reservation, displayTimeout);
            }, clickTimeout);
        }

        function wait_complete_reservation() {
            var ctts = document.getElementById("tvReserveRecordingComplete-ctts");
            if (!ctts) {
                setTimeout(wait_complete_reservation, pollingTimeout);
                return;
            }
            debug("completed");
            parseSearchDetail(titles);
        }

    }

    function nextKeyword() {
        setTimeout(function() {
            gotoPage(urldelcomp);
            location.href = urllist + "?disp=now";
        }, clickTimeout);
    }

    function searchKeyword() {
        try {
            var form = document.getElementById("v2-hikari__h_search_form");
            if (!form) {
                setTimeout(searchKeyword, pollingTimeout);
                return;
            }
            var keywordIndex1 = parseInt(LS_getValue("keywordIndex1"));
            var keywordIndex = parseInt(LS_getValue("indexOfKeywords")) - 1;
            if (keywordIndex1 >= 0) {
                if (keywordIndex < keywordIndex1) {
                    done1();
                    return;
                }
                keywordIndex = keywordIndex1;
            }
            if (!(keywordIndex >= 0)) {
                done1();
                return
            }
            LS_putValue("indexOfKeywords", keywordIndex);
            var keyword = strip(LS_getValue("keyword" + keywordIndex));
            console.log("keyword:" + keyword);
            var textbox = form.getElementsByTagName("input")[0];
            textbox.value = keyword;
            var submit = form.getElementsByTagName("input")[1];
            setTimeout(function() {
                gotoPage(urlsearch);
                submit.click();
            }, clickTimeout);
        } catch (e) {
            console.log("EXCEPTION:searchKeyword:" + e);
        }
    }

    function done1() {
        console.log("DONE");
        setTimeout(function() {
            gotoPage(urlrestart);
            location.href = urlstart;
        }, clickTimeout);
    }

    function handleDeleteReservation() {
        try {
            var tables = document.getElementsByTagName("table");
            for (table of tables) {
                var asl = table.getElementsByTagName("a");
                for (var i = 0; i < asl.length; i++) {
                    try {
                        if (asl[i].textContent != "×") {
                            continue;
                        }
                        var onclick = asl[i].getAttribute("onClick");
                        gotoPage(urldelcomp);
                        setTimeout(function() {
                            var delReservedData = unsafeWindow.delReservedData;
                            unsafeWindow.confirm = unsafeWindow.String;
                            eval('{' + onclick + '}');
                        }, clickTimeout);
                        return;
                    } catch (e) {
                        console.log("EXCEPTION:handleDeleteReservation:" + e);
                    }
                }
            }
        } catch (e) {}
        debug("no items to delete");
        searchKeyword();
    }

    function handleCancelReservation() {
        try {
            var tables = document.getElementsByTagName("table");
            for (table of tables) {
                var asl = table.getElementsByTagName("a");
                for (var i = 0; i < asl.length; i++) {
                    try {
                        if (asl[i].textContent != "×") {
                            continue;
                        }
                        var onclick = asl[i].getAttribute("onClick");
                        gotoPage(urlcancomp);
                        setTimeout(function() {
                            var delReservedData = unsafeWindow.delReservedData;
                            unsafeWindow.confirm = unsafeWindow.String;
                            eval('{' + onclick + '}');
                        }, clickTimeout);
                        return;
                    } catch (e) {
                        console.log("EXCEPTION:handleCancelReservation:" + e);
                    }
                }
            }
        } catch (e) {}
        try {
            debug("next cancel list");
            var p = document.getElementsByClassName("next")[0];
            var href = p.getElementsByTagName("a")[0].href;
            setTimeout(function() {
                gotoPage(urlcancomp);
                location.href = href;
            }, clickTimeout);
            return;
        } catch (e) {}
        debug("no items to cancel");
        location.href = urllist + "?disp=before";
        return true;
    }

    function startAutoReserve() {
        try {
            debug("start auto reserve");
            LS_deleteValue("nextFire");
            T_DB.clearAll();
            D_DB.clearAll();
            R_DB.clearLess(Date.now() - history);
            for (var keywordIndex = 0;; keywordIndex++) {
                var keyword = strip(LS_getValue("keyword" + keywordIndex));
                if (keyword == "") {
                    break;
                }
            }
            LS_putValue("indexOfKeywords", keywordIndex);
            gotoPage(urllist);
            location.href = urllist + "?disp=before";
        } catch (e) {
            debug("EXCEPTION:" + e)
            debug("STACK:" + e.stack)
        }
    }

    // Main UI
    function akr_UI() {
        try {
            var tableTemplate = '' +
                '<div>' + '<h1 style="text-align:center;color:#00a2e6;margin-bottom:20px;margin-top:60px;">' +
                '<span>キーワード自動予約</span></h1>' +
                '<div class="table__scroll--fixed"><table class="table__description th_head01"><tr>' +
                '<th>キーワード</th>' +
                '<th>番組ジャンル</th>' +
                '<th>チャンネル</th>' +
                '<th>除外ワード</th>' +
                '<th></th>' +
                '</tr></table></div><div id="akr_option" style="padding:6px;">' +
                '予約範囲：<select id="akr_days"><option>1</option><option>2</option><option>3</option>' +
                '<option>4</option><option>5</option><option>6</option><option>7</option></select>日後まで　　' +
                '<input type="checkbox" id="akr_rep"><label id="akr_rep_text" for="akr_rep">' +
                '予約を自動リピートする</label>' + '<p class="text-center btn_chg">' +
                '<input class="btn__default link--on-mouse" id="akr_start" value="自動予約">' +
                '</p></div></div>';
            var keywordTemplate1 = '' +
                '<td class="text-left"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
                '<td class="text-left"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
                '<td class="text-left"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
                '<td class="text-left"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
                '<td class="text-left"><button>保存</button></td>';
            var keywordTemplate2 = '' +
                '<td style="text-left"></td>' +
                '<td style="text-left"></td>' +
                '<td style="text-left"></td>' +
                '<td style="text-left"></td>' +
                '<td style="text-left"><button>編集</button><button>予約</button></td>';

            var editAction = function(e) {
                var oldTr = e.target.parentNode.parentNode;
                var newTr = document.createElement("tr");
                newTr.innerHTML = keywordTemplate1;
                var tds = oldTr.getElementsByTagName("td");
                var inputs = newTr.getElementsByTagName("input");
                inputs[0]._originalValue = inputs[0].value = tds[0].textContent;
                inputs[1]._originalValue = inputs[1].value = tds[1].textContent;
                inputs[2]._originalValue = inputs[2].value = tds[2].textContent;
                inputs[3]._originalValue = inputs[3].value = tds[3].textContent;
                var button = newTr.getElementsByTagName("button")[0];
                button.addEventListener('click', saveAction, false);
                table.replaceChild(newTr, oldTr);
                return true;
            }

            var start1Action = function(e) {
                var tr = e.target.parentNode.parentNode;
                var list = table.getElementsByTagName("tr");
                for (var i = 0; i < list.length; i++) {
                    if (list[i] === tr) {
                        debug("start clicked " + i);
                        e.target.disabled = true;
                        LS_putValue("keywordIndex1", i - 1);
                        startAutoReserve();
                        return true;
                    }
                }
                return true;
            }

            var saveAction = function(e) {
                var oldTr = e.target.parentNode.parentNode;
                var newTr = document.createElement("tr");
                newTr.innerHTML = keywordTemplate2;
                var tds = newTr.getElementsByTagName("td");
                var inputs = oldTr.getElementsByTagName("input");
                var keyword = tds[0].textContent = inputs[0].value;
                tds[1].textContent = inputs[1].value;
                tds[2].textContent = inputs[2].value;
                tds[3].textContent = inputs[3].value;
                var button = newTr.getElementsByTagName("button")[0];
                button.addEventListener('click', editAction, false);
                var button = newTr.getElementsByTagName("button")[1];
                button.addEventListener('click', start1Action, false);
                var trs = table.getElementsByTagName("tr");
                for (var j = -1; j < trs.length - 1; j++) {
                    if (trs[j + 1] == oldTr) {
                        break;
                    }
                }
                if (inputs[0]._originalValue != LS_getValue("keyword" + j)) {
                    return false;
                }
                if (e.target.textContent == "保存") {
                    if (keyword != "") {
                        table.replaceChild(newTr, oldTr);
                        LS_putValue("keyword" + j, tds[0].textContent);
                        LS_putValue("genre" + j, tds[1].textContent);
                        LS_putValue("channel" + j, tds[2].textContent);
                        LS_putValue("except" + j, tds[3].textContent);
                    } else {
                        table.removeChild(oldTr);
                        for (;; j++) {
                            LS_putValue("keyword" + j, k = LS_getValue("keyword" + (j + 1)));
                            LS_putValue("genre" + j, LS_getValue("genre" + (j + 1)));
                            LS_putValue("channel" + j, LS_getValue("channel" + (j + 1)));
                            LS_putValue("except" + j, LS_getValue("except" + (j + 1)));
                            if (k == "") {
                                break;
                            }
                        }
                    }
                } else if (e.target.textContent == "追加") {
                    if (keyword != "") {
                        table.replaceChild(newTr, oldTr);
                        inputs[0].value = "";
                        inputs[1].value = "";
                        inputs[2].value = "";
                        inputs[3].value = "";
                        table.appendChild(oldTr);
                        LS_putValue("keyword" + j, tds[0].textContent);
                        LS_putValue("genre" + j, tds[1].textContent);
                        LS_putValue("channel" + j, tds[2].textContent);
                        LS_putValue("except" + j, tds[3].textContent);
                        LS_putValue("keyword" + (j + 1), "");
                    }
                }
                return true;
            }
            var clickAction = function(e) {
                LS_putValue("automatic", options[0].checked);
                if (!options[0].checked) {
                    LS_deleteValue("nextFire");
                    countDownTime = 0;
                    akr_rep_text.textContent = "予約を自動リピートする";
                }
                return true;
            }
            var countDownTime = 0;
            var countDownRemain;
            var countDown = function() {
                if (countDownTime == 0) {
                    return;
                }
                var now = Date.now();
                var sec = Math.floor((countDownTime - now) / 1000);
                if (sec < countDownRemain) {
                    sec = --countDownRemain;
                }
                if (sec < 0) {
                    LS_putValue("keywordIndex1", -1);
                    startAutoReserve();
                    return;
                }
                var min = Math.floor(sec / 60);
                sec -= min * 60;
                akr_rep_text.textContent = "予約を自動リピートする(あと" +
                    min + "分" + sec + "秒で自動的に予約を実行します)";
                setTimeout(countDown, 1000);
            }
            var startAction = function() {
                debug("start clicked");
                akr_start.disabled = true;
                LS_putValue("keywordIndex1", -1);
                startAutoReserve();
                return true;
            }

            var contents_member = document.getElementById("contents_member");
            var div = document.createElement("div");
            div.innerHTML = tableTemplate;
            contents_member.appendChild(div);
            var table = div.getElementsByTagName("table")[0];
            for (var i = 0;; i++) {
                var keyword = LS_getValue("keyword" + i);
                if (keyword == "") {
                    break;
                }
                var tr = document.createElement("tr");
                tr.innerHTML = keywordTemplate2;
                var tds = tr.getElementsByTagName("td");
                tds[0].textContent = keyword;
                tds[1].textContent = LS_getValue("genre" + i);
                tds[2].textContent = LS_getValue("channel" + i);
                tds[3].textContent = LS_getValue("except" + i);
                var button = tr.getElementsByTagName("button")[0];
                button.addEventListener('click', editAction, false);
                var button = tr.getElementsByTagName("button")[1];
                button.addEventListener('click', start1Action, false);
                table.appendChild(tr);
            }
            var tr = document.createElement("tr");
            tr.innerHTML = keywordTemplate1;
            var inputs = tr.getElementsByTagName("input");
            inputs[0]._originalValue = "";
            inputs[1]._originalValue = "";
            inputs[2]._originalValue = "";
            inputs[3]._originalValue = "";
            var button = tr.getElementsByTagName("button")[0];
            button.textContent = "追加";
            button.addEventListener('click', saveAction, false);
            table.appendChild(tr);
            var akr_option = document.getElementById("akr_option");
            var options = akr_option.getElementsByTagName("input");
            options[0].checked = (LS_getValue("automatic") != "false");
            options[0].addEventListener('click', clickAction, false);
            var akr_days = document.getElementById("akr_days");
            akr_days.selectedIndex = parseInt(LS_getValue("akr_days"));
            akr_days.addEventListener('change', function() {
                LS_putValue("akr_days", akr_days.selectedIndex);
            }, false);
            var akr_start = document.getElementById("akr_start");
            akr_start.addEventListener('click', startAction, false);
            var akr_rep_text = document.getElementById("akr_rep_text");
            if (options[0].checked) {
                var nextFire = LS_getValue("nextFire");
                if (nextFire == "") {
                    return;
                }
                countDownTime = parseInt(nextFire);
                countDownRemain = countDownThreshold;
                countDown();
            }
            return;
        } catch (e) {
            console.log("EXCEPTION:akr_UI:" + e);
        }
    }

    // Main Transitions
    debug("entering " + document.URL)

    if (document.URL == urlstart) {
        if (isExpectingPage(urlrestart)) {
            LS_putValue("nextFire", Date.now() + interval);
        }
        LS_deleteValue("expecting");
        akr_UI();
        return;
    }

    if (document.URL.indexOf(urllist) == 0 && isExpectingPage(urllist)) {
        parseReservationList();
        nextList();
        return;
    }

    if (document.URL.indexOf(urlsearch) == 0 && isExpectingPage(urlsearch)) {
        setTimeout(function() {
            var div = document.getElementById("js-tab-menu-area");
            var ul = div.getElementsByTagName("ul")[1];
            var li = ul.getElementsByTagName("li")[1];
            var a = li.getElementsByTagName("a")[0];
            location.href = a.getAttribute("data-href");
            setTimeout(parseSearchResult, displayTimeout);
        }, clickTimeout);
        return
    }

    if (document.URL == urllist + "?disp=now" && isExpectingPage(urldelcomp)) {
        debug("deleting expired reservation...");
        handleDeleteReservation();
        return;
    }
    if (document.URL.indexOf(urldelcomp) == 0 && isExpectingPage(urldelcomp)) {
        handleDeleteReservation();
        return;
    }

    if (document.URL.indexOf(urllist) == 0 && isExpectingPage(urlcancomp)) {
        handleCancelReservation();
        return;
    }
    if (document.URL.indexOf(urldelcomp) == 0 && isExpectingPage(urlcancomp)) {
        handleCancelReservation();
        return;
    }
    if (document.URL == urllist + "?disp=before") {
        var contents_member = document.getElementById("contents_member");
        var div = document.createElement("div");
        div.innerHTML = '<button style="float:right;">すべてキャンセル</button>';
        var button = div.getElementsByTagName("button")[0];
        button.addEventListener('click', function() {
            if (window.confirm('キャンセル可能な予約をすべてキャンセルしますか？')) {
                debug("canceling reservation...");
                handleCancelReservation();
            }
        }, false);
        contents_member.appendChild(div);
        return;
    }

})();
