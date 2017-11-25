
/*
Copyright(C) 2014-2017 rtrdprgrmr

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
// @copyright	2014-2017, rtrdprgrmr
// @license	MIT
// @downloadURL	https://rtrdprgrmr.github.io/akrhikari/AutoReservation.user.js
// @updateURL	https://rtrdprgrmr.github.io/akrhikari/AutoReservation.meta.js
// @homepageURL	https://akrhikari.blogspot.jp/2014/08/blog-post.html
// @supportURL	https://github.com/rtrdprgrmr/akrhikari/issues
// @include     https://www.hikaritv.net/*
// @include     https://accounts.hikaritv.net/member/*
// @grant	GM_getValue
// @grant	GM_setValue
// @grant	GM_deleteValue
// @version     2.32
// ==/UserScript==
//

var debug_on = false;
var trace_on = false;

function debug() {
	if (!debug_on) return;
	var args = Array.prototype.slice.call(arguments);
	console.log.apply(console, ["debug:"].concat(args));
}

function trace() {
	if (!trace_on) return;
	var args = Array.prototype.slice.call(arguments);
	console.log.apply(console, ["trace:"].concat(args));
}

var onehour = 60 * 60 * 1000;
var oneday = 24 * onehour;

// ---------------------------- Parameters ----------------------------

var history = 60 * oneday;
var auto_reserve_interval = 1 * onehour;
var displayTimeout = 2000;
var clickTimeout = 1000;
var pollingTimeout = 300;
var countDownThreshold = 60; // sec

var url_entry = "https://www.hikaritv.net/member/remote/reserve/regist";
var url_reservation_list = "https://www.hikaritv.net/member/remote/reserve/list?disp=before";
var url_expired_list = "https://www.hikaritv.net/member/remote/reserve/list?disp=now";
var url_delete_complete = "https://www.hikaritv.net/member/remote/reserve/delete_complete";
var url_search_all = "https://www.hikaritv.net/search/all/";
var url_search_tv = "https://www.hikaritv.net/search/tv/";
var url_detail = "https://www.hikaritv.net/tv/detail/";
var url_recording_confirm = "https://www.hikaritv.net/tv/reserve/recording/confirm/";
var url_recording_complete = "https://www.hikaritv.net/tv/reserve/recording/complete";
var url_login = "https://accounts.hikaritv.net/member/login";
var url_login_complete = "https://accounts.hikaritv.net/member/login_do";

// ---------------------------- Database ----------------------------

function LS_getValue(key) {
	return GM_getValue(key, "").toString();
}

function LS_putValue(key, value) {
	GM_setValue(key, value.toString());
}

function LS_deleteValue(key) {
	GM_deleteValue(key);
}

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

// ---------------------------- Main UI ----------------------------

function UI() {
	var tableTemplate = '' +
		'<div style="margin-bottom:20px;margin-top:60px;position:relative">' +
		'<div><h1 style="text-align:center;color:#00a2e6">キーワード自動予約</h1></div>' +
		'<nav style="position:absolute;bottom:0;right:0">' +
		'<ul class="menu" style="width:31px"><li class="menu__mega">' +
		'<div style="padding:5px;color:#fff;text-align:center">&#9881;</div>' +
		'<ul class="menu__second-level" style="width:270px">' +
		'<li><p><a href="#" id="save_resv_conf">予約設定の書き出し</a></li>' +
		'<li><p><a href="#" id="restore_resv_conf">予約設定の復元</a></li>' +
		'<input type="file" id="file_resv_conf" style="display:none">' +
		'</ul>' +
		'</li></ul>' +
		'</nav>' +
		'</div>' +
		'<div class="table__scroll--fixed"><table class="table__description th_head01"><tr>' +
		'<th width="30%">キーワード</th>' +
		'<th width="15%">番組ジャンル</th>' +
		'<th width="15%">チャンネル</th>' +
		'<th width="30%">除外ワード</th>' +
		'<th width="5%"></th>' +
		'<th width="5%"></th>' +
		'</tr></table></div>' +
		'<div id="akr_option" style="padding:6px;">' +
		'予約範囲：<select id="akr_days"><option>1</option><option>2</option><option>3</option>' +
		'<option>4</option><option>5</option><option>6</option><option>7</option></select>日後まで　　' +
		'<input type="checkbox" id="akr_rep" style="margin:20px 5px 20px 5px">' +
		'<label id="akr_rep_text" for="akr_rep">予約を自動リピートする</label>' +
		'<p class="text-center btn_chg">' +
		'<input class="btn__default link--on-mouse" id="akr_start" value="自動予約">' +
		'</p>' +
		'</div>';
	var keywordTemplate1 = '' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:5px"><button>保存</button></td>' +
		'<td style="padding:5px"><button>削除</button></td>';
	var keywordTemplate2 = '' +
		'<td class="text-left"></td>' +
		'<td class="text-left"></td>' +
		'<td class="text-left"></td>' +
		'<td class="text-left"></td>' +
		'<td style="padding:5px"><button>編集</button></td>' +
		'<td style="padding:5px"><button>予約</button></td>';
	var keywordTemplate3 = '' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:17px"><input type="text" class="l-border-light-blue" style="width:100%"></td>' +
		'<td style="padding:5px"><button>追加</button></td>';

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
		var button = newTr.getElementsByTagName("button")[1];
		button.addEventListener('click', deleteAction, false);
		table.replaceChild(newTr, oldTr);
		return true;
	}

	var start1Action = function(e) {
		var tr = e.target.parentNode.parentNode;
		var list = table.getElementsByTagName("tr");
		for (var i = 0; i < list.length; i++) {
			if (list[i] === tr) {
				console.log("start clicked " + i);
				e.target.disabled = true;
				LS_putValue("indexOfTheKeyword", i - 1);
				startAutoReserve();
				return true;
			}
		}
		return true;
	}

	var deleteAction = function(e) {
		var oldTr = e.target.parentNode.parentNode;
		var inputs = oldTr.getElementsByTagName("input");
		inputs[0].value = "";
		e.target.textContent = "保存";
		saveAction(e);
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
			if (trs[j + 1] === oldTr) {
				break;
			}
		}
		if (inputs[0]._originalValue != LS_getValue("keyword" + j)) {
			return false;
		}
		if (e.target.textContent === "保存") {
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
					if (k === "") {
						break;
					}
				}
			}
		} else if (e.target.textContent === "追加") {
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
		if (options[0].checked) {
			if (!LS_getValue("nextFire")) {
				LS_putValue("nextFire", Date.now() + auto_reserve_interval);
			}
			countDownRemain = countDownThreshold;
			countDown();
		} else {
			LS_deleteValue("nextFire");
			akr_rep_text.textContent = "予約を自動リピートする";
		}
		return true;
	}
	var countDownRemain;
	var countDown = function() {
		if (!options[0].checked) {
			return;
		}
		var nextFire = LS_getValue("nextFire");
		if (!nextFire) {
			return;
		}
		var countDownTime = parseInt(nextFire);
		var now = Date.now();
		var sec = Math.floor((countDownTime - now) / 1000);
		if (sec < countDownRemain) {
			sec = --countDownRemain;
		}
		if (sec < 0) {
			LS_putValue("indexOfTheKeyword", -1);
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
		console.log("start clicked");
		akr_start.disabled = true;
		LS_putValue("indexOfTheKeyword", -1);
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
		if (keyword === "") {
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
	tr.innerHTML = keywordTemplate3;
	var inputs = tr.getElementsByTagName("input");
	inputs[0]._originalValue = "";
	inputs[1]._originalValue = "";
	inputs[2]._originalValue = "";
	inputs[3]._originalValue = "";
	var button = tr.getElementsByTagName("button")[0];
	button.addEventListener('click', saveAction, false);
	table.appendChild(tr);
	var akr_option = document.getElementById("akr_option");
	var options = akr_option.getElementsByTagName("input");
	options[0].checked = (LS_getValue("automatic") === "true");
	options[0].addEventListener('click', clickAction, false);
	var akr_days = document.getElementById("akr_days");
	var days_index = parseInt(LS_getValue("akr_days"));
	if (!(0 <= days_index && days_index <= 6)) {
		days_index = 4;
		LS_putValue("akr_days", days_index);
	}
	akr_days.selectedIndex = days_index;
	akr_days.addEventListener('change', function() {
		LS_putValue("akr_days", akr_days.selectedIndex);
	}, false);

	var akr_start = document.getElementById("akr_start");
	akr_start.addEventListener('click', startAction, false);
	var akr_rep_text = document.getElementById("akr_rep_text");
	clickAction();

	var save_resv_conf = document.getElementById("save_resv_conf");
	var saveConfAction = function() {
		var list = [];
		for (var i = 0;; i++) {
			var keyword = LS_getValue("keyword" + i);
			if (keyword === "") {
				break;
			}
			var genre = LS_getValue("genre" + i);
			var channel = LS_getValue("channel" + i);
			var except = LS_getValue("except" + i);
			list.push({
				keyword,
				genre,
				channel,
				except
			});
		}
		var content = JSON.stringify(list, null, 4);
		var blob = new Blob([content], {
			"type": "application/json"
		});
		var d = new Date();
		save_resv_conf.download = "akrkwd-" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() + ".json";
		save_resv_conf.href = window.URL.createObjectURL(blob);
	};
	save_resv_conf.addEventListener('click', saveConfAction, false);

	var restore_resv_conf = document.getElementById("restore_resv_conf");
	var restoreConfAction = function(e) {
		e.preventDefault();
		var file_resv_conf = document.getElementById("file_resv_conf");
		file_resv_conf.addEventListener('change', onchange, false);
		file_resv_conf.click();

		function onchange() {
			var file = this.files[0];
			var fr = new FileReader();
			fr.readAsText(file);
			fr.onload = function() {
				var text = fr.result;
				try {
					var list = JSON.parse(text);
				} catch (e) {
					console.log("ERROR: " + file.name, e)
					return;
				}
				for (var j = 0; j < list.length; j++) {
					LS_putValue("keyword" + j, list[j].keyword);
					LS_putValue("genre" + j, list[j].genre);
					LS_putValue("channel" + j, list[j].channel);
					LS_putValue("except" + j, list[j].except);
				}
				LS_putValue("keyword" + j, "");
				location.reload();
			};
		}
		return false;
	};
	restore_resv_conf.addEventListener('click', restoreConfAction, false);
	return;
}

// ---------------------------- Utilities ----------------------------

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
	args = content.match(/([0-9]{3,3})/);
	var channo = args[args.length - 1];
	return channo;
}

function checkTitlePre1(title, channo) {
	var indexOfKeywords = parseInt(LS_getValue("indexOfKeywords"));
	var channelREX = new RegExp(channel_source = stripconv(LS_getValue("channel" + indexOfKeywords)), "i");
	var exceptREX = new RegExp(stripconv(LS_getValue("except" + indexOfKeywords)), "i");
	var code = encode(title);
	if (exceptREX.test(title) && exceptREX.exec(title)[0].length > 0) {
		console.log("except:" + title)
		return false;
	}
	if (channo && channel_source.search(/[^0-9+*?{,}\[\]-]/) < 0) {
		if (!channelREX.test(channo)) {
			console.log("not channo:" + title)
			return false;
		}
	}
	return true;
}

function checkTitlePre2(title) {
	var code = encode(title);
	if (R_DB.get(code) !== 0) {
		console.log("reserved:" + title);
		return false;
	}
	if (T_DB.get(code) !== 0) {
		console.log("reserving:" + title);
		return false;
	}
	return true;
}

function checkTitle(title, range, genre, channel, isPremium) {
	var indexOfKeywords = parseInt(LS_getValue("indexOfKeywords"));
	var genreREX = new RegExp(stripconv(LS_getValue("genre" + indexOfKeywords)), "i");
	var channelREX = new RegExp(channel_source = stripconv(LS_getValue("channel" + indexOfKeywords)), "i");
	var exceptREX = new RegExp(stripconv(LS_getValue("except" + indexOfKeywords)), "i");
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
	return true;
}

function reservingTitle(title) {
	var code = encode(title);
	T_DB.put(code, 2);
}

function checkDate(start) {
	var days_index = parseInt(LS_getValue("akr_days"));
	var lookahead = (days_index + 1) * oneday;
	var now = Date.now();
	if (now + lookahead < start) {
		return false;
	}
	return true;
}

function isExpectingPage() {
	var expecting = LS_getValue("expecting");
	for (var i = 0; i < arguments.length; i++) {
		var page = arguments[i];
		if (expecting === page) {
			LS_deleteValue("expecting");
			setTimeout(function() {
				if (page === "done") return
				console.log("RELOADING... " + document.URL);
				LS_putValue("expecting", page);
				var script = document.createElement('script');
				script.appendChild(document.createTextNode('location.reload();'));
				document.body.appendChild(script);
			}, 300000);
			return true;
		}
	}
	return false;
}

// ---------------------------- Parsers & Handlers ----------------------------

var pollingCount = 0;
var expandCount = 0;

function handleExpiredReservation(resolve, reject) {
	var tables = document.getElementsByTagName("table");
	for (var table of tables) {
		var asl = table.getElementsByTagName("a");
		for (var i = 0; i < asl.length; i++) {
			if (asl[i].textContent != "×") {
				continue;
			}
			var onclick = asl[i].getAttribute("onClick");
			debug("goto delete expired reservation");
			LS_putValue("expecting", "delete_complete");
			setTimeout(function() {
				var delReservedData = unsafeWindow.delReservedData;
				unsafeWindow.confirm = unsafeWindow.String;
				eval('{' + onclick + '}');
			}, clickTimeout);
			return;
		}
	}
	console.log("no items to delete");
	resolve();
}

function parseReservationList(resolve) {
	var main = document.getElementById("contents_member");
	var table = main.getElementsByTagName("table")[0];
	if (!table) {
		resolve();
	}
	var list = table.getElementsByTagName("tr");
	for (var i = 1; i < list.length; i++) {
		var tds = list[i].getElementsByTagName("td");
		var range = parseTimeRange(tds[1].textContent);
		var channo = parseChannel(tds[3].textContent);
		var start = new Date(range[0]).toISOString();
		var end = new Date(range[1]).toISOString();
		var title = tds[2].textContent;
		title = stripconv(title);
		var state = tds[4].textContent;
		trace("reservation list", title, channo, start, end, state);
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
	}
	if (!resolve) return;
	try {
		var p = document.getElementsByClassName("next")[0];
		var href = p.getElementsByTagName("a")[0].href;
		setTimeout(function() {
			debug("goto next reservation list");
			LS_putValue("expecting", "reservation_list");
			location.href = href;
		}, clickTimeout);
		return;
	} catch (e) {}
	resolve();
}

function parseSearchResult(resolve, reject) {
	var div_tab_tv = document.getElementById("tab-tv");
	var ul = div_tab_tv.getElementsByClassName("search-list")[0];
	if (!ul) {
		if (document.getElementsByClassName("seach-error")[0]) {
			reject();
			return;
		}
		if (++pollingCount >= 100) {
			console.log("WARN: parseSearchResult polling timeout")
			reject();
			return;
		}
		setTimeout(parseSearchResult, pollingTimeout, resolve, reject);
		return;
	}
	var wall = div_tab_tv.getElementsByClassName("search-result-wall")[0];
	var inp = wall.getElementsByTagName("input")[0];
	if (inp.value === "さらに表示する" && Array.prototype.indexOf.call(inp.classList, "js-hide") < 0 && ++expandCount <= 10) {
		setTimeout(function() {
			debug("goto show more results");
			inp.click();
			setTimeout(parseSearchResult, displayTimeout, resolve, reject);
		}, clickTimeout);
		return;
	}

	var chimgREX = new RegExp("https://www.hikaritv.net/resources/hikari/pc/images/ch_logo/ch[0-9]+/([0-9]{3,3}).png");
	var indexOfKeywords = parseInt(LS_getValue("indexOfKeywords"));
	var keyword = strip(LS_getValue("keyword" + indexOfKeywords));
	var list = ul.getElementsByTagName("li");
	var indexOfTitles = 0;
	for (var i = 0; i < list.length; i++) {
		var title = stripconv(list[i].textContent);
		var crid = list[i].getAttribute("data-href").split('&')[1];
		if (!crid || !title) continue;
		var img = list[i].getElementsByTagName("img")[0];
		var src = img.getAttribute("src");
		var m = src.match(chimgREX);
		if (m && m[1]) {
			var channo = m[1];
		}
		if (!checkTitlePre1(title, channo)) {
			continue;
		}
		trace("search result", title, crid)
		LS_putValue("title" + indexOfTitles, title);
		LS_putValue("crid" + indexOfTitles, crid);
		indexOfTitles++;
	}
	LS_putValue("indexOfTitles", indexOfTitles);
	resolve();
}

function handleTitleDetail(resolve, reject) {
	var indexOfTitles = parseInt(LS_getValue("indexOfTitles"));
	var title = LS_getValue("title" + indexOfTitles);
	var crid = LS_getValue("crid" + indexOfTitles);
	var ctts = document.getElementById("tvDetail-ctts");
	if (!ctts) {
		if (++pollingCount >= 100) {
			console.log("WARN: handleTitleDetail polling timeout")
			reject();
			return;
		}
		setTimeout(handleTitleDetail, pollingTimeout, resolve, reject);
		return;
	}
	var section = ctts.getElementsByTagName("section")[0];
	if (!section) {
		var div = ctts.getElementsByClassName("error-report")[0];
		if (div) {
			console.log("not found:" + title);
			console.log(div.textContent)
			reject();
			return;
		}
		if (++pollingCount >= 100) {
			console.log("WARN: handleTitleDetail polling timeout")
			reject();
			return;
		}
		setTimeout(handleTitleDetail, pollingTimeout, resolve, reject);
		return;
	}

	var record_area = section.getElementsByClassName("record_area")[0];
	var record_area_a = record_area.getElementsByTagName("a")[0];
	var h3 = ctts.getElementsByClassName("mdConts_tabInner_title")[0];
	var table = section.getElementsByTagName("table")[0];
	var tds = section.getElementsByTagName("td");
	var title1 = stripconv(h3.textContent);
	var range = parseTimeRange2(tds[0].textContent);
	var genre = stripconv(tds[1].textContent);
	var channel = stripconv(tds[2].textContent);
	if (!record_area_a) {
		console.log("not recordable:" + title);
		reject();
		return;
	}
	if (strip(record_area.textContent) === "録画予約済み") {
		console.log("already reserved:" + title);
		var code = encode(title);
		R_DB.put(code, range[0]);
		reject();
		return;
	}
	var crid1 = record_area_a.getAttribute("data-crid");
	if (crid != crid1) {
		console.log("ASSERT: crid mismatch", crid, crid1);
		reject();
		return;
	}
	if (strip(record_area.textContent) != "録画予約") {
		console.log("not recordable:" + title);
		reject();
		return;
	}
	if (title != title1) {
		console.log("UNEXPECTED: " + title1 + " EXPECTED: " + title);
		reject();
		return;
	}
	var attrs1 = section.getElementsByClassName("mdConts-attibute")[0];
	var attrs = attrs1.children[0].children;
	for (var attr of attrs) {
		if (attr.textContent === "プレミアムチャンネル") {
			var isPremium = true;
		}
	}
	if (!checkTitle(title, range, genre, channel, isPremium)) {
		reject();
		return;
	}
	setTimeout(function() {
		var start = new Date(range[0]).toISOString();
		console.log("going to reserve:" + start + " " + title);
		LS_putValue("expecting", "reserve_recording");
		record_area_a.click();
		setTimeout(handleConfirmReservation, displayTimeout, nextTitle, nextTitle);
	}, clickTimeout);
}

function handleConfirmReservation(resolve, reject) {
	var ctts = document.getElementById("tvReserveRecordingConfirm-ctts");
	if (!ctts) {
		if (++pollingCount >= 100) {
			console.log("WARN: handleConfirmReservation polling timeout")
			reject();
			return;
		}
		setTimeout(handleConfirmReservation, pollingTimeout, resolve, reject);
		return;
	}
	var btn = document.getElementsByClassName("btn-remote-reserve-rec")[0];
	var btn_a = btn.getElementsByTagName("a")[0];
	setTimeout(function() {
		console.log("confirming record-reservation");
		LS_putValue("expecting", "confirm_recording");
		btn_a.click();
		setTimeout(handleCompleteReservation, displayTimeout, nextTitle, nextTitle);
	}, clickTimeout);
}

function handleCompleteReservation(resolve, reject) {
	var ctts = document.getElementById("tvReserveRecordingComplete-ctts");
	if (!ctts) {
		if (++pollingCount >= 100) {
			console.log("WARN: handleCompleteReservation polling timeout")
			reject();
			return;
		}
		setTimeout(handleCompleteReservation, pollingTimeout, resolve, reject);
		return;
	}
	var indexOfTitles = parseInt(LS_getValue("indexOfTitles"));
	var title = LS_getValue("title" + indexOfTitles);
	reservingTitle(title);
	console.log("reservation completed " + title);
	resolve();
}

// ---------------------------- Main transitions ----------------------------

console.log("entering " + document.URL + " expecting " + LS_getValue("expecting"));

if (document.URL.indexOf(url_entry) === 0) {
	LS_deleteValue("expecting");
	UI();
	return;
}

function startAutoReserve() {
	console.log("start auto reserve");
	LS_deleteValue("nextFire");
	T_DB.clearAll();
	D_DB.clearAll();
	R_DB.clearLess(Date.now() - history);
	debug("goto expired reservation list");
	LS_putValue("expecting", "expired_list");
	location.href = url_expired_list;
}

if (document.URL.indexOf(url_expired_list) === 0 && isExpectingPage("expired_list")) {
	console.log("deleting expired reservation...");
	handleExpiredReservation(startSearchKeywords);
	return;
}

if (document.URL.indexOf(url_delete_complete) === 0 && isExpectingPage("delete_complete")) {
	handleExpiredReservation(startSearchKeywords);
	return;
}

function startSearchKeywords() {
	for (var indexOfKeywords = 0;; indexOfKeywords++) {
		var keyword = strip(LS_getValue("keyword" + indexOfKeywords));
		if (keyword === "") {
			break;
		}
	}
	LS_putValue("indexOfKeywords", indexOfKeywords);
	searchLoopEntry();
}

function searchLoopEntry() {
	setTimeout(function() {
		debug("goto reservation list");
		LS_putValue("expecting", "reservation_list");
		location.href = url_reservation_list;
	}, clickTimeout);
}

if (document.URL.indexOf(url_reservation_list) === 0 && isExpectingPage("reservation_list")) {
	setTimeout(parseReservationList, pollingTimeout, function() {
		if (nextKeyword0()) {
			searchKeyword();
			return;
		}
		setTimeout(function() {
			console.log("DONE");
			LS_putValue("expecting", "done");
			location.href = url_entry;
		}, clickTimeout);
	});
	return;
}

if (document.URL.indexOf(url_reservation_list) === 0) {
	setTimeout(parseReservationList, pollingTimeout, function() {});
	return;
}

function nextKeyword() {
	debug("nextKeyword");
	searchLoopEntry();
}

function nextKeyword0() {
	var indexOfKeywords = parseInt(LS_getValue("indexOfKeywords"));
	if (!(indexOfKeywords >= 0)) {
		console.log("ERROR: indexOfKeywords == " + indexOfKeywords)
		return false;
	}
	var indexOfTheKeyword = parseInt(LS_getValue("indexOfTheKeyword"));
	if (indexOfTheKeyword >= 0) {
		if (indexOfKeywords <= indexOfTheKeyword) {
			return false;
		}
		indexOfKeywords = indexOfTheKeyword;
	} else {
		if (indexOfKeywords === 0) {
			return false;
		}
		indexOfKeywords--;
	}
	LS_putValue("indexOfKeywords", indexOfKeywords);
	return true;
}

function searchKeyword() {
	debug("searchKeyword");
	var form = document.getElementById("v2-hikari__h_search_form");
	if (!form) {
		if (++pollingCount >= 100) {
			console.log("WARN: searchKeyword polling timeout")
			return;
		}
		setTimeout(searchKeyword, pollingTimeout);
		return;
	}
	var indexOfKeywords = parseInt(LS_getValue("indexOfKeywords"));
	var keyword = strip(LS_getValue("keyword" + indexOfKeywords));
	console.log("keyword:" + keyword);
	var textbox = form.getElementsByTagName("input")[0];
	textbox.value = keyword;
	var submit = form.getElementsByTagName("input")[1];
	setTimeout(function() {
		debug("goto search result (all)");
		LS_putValue("expecting", "search_result");
		submit.click();
	}, clickTimeout);
}

if (document.URL.indexOf(url_search_all) === 0 && isExpectingPage("search_result")) {
	setTimeout(function() {
		var div = document.getElementById("js-tab-menu-area");
		if (!div) {
			nextKeyword();
			return;
		}
		var ul = div.getElementsByTagName("ul")[1];
		var li = ul.getElementsByTagName("li")[1];
		var a = li.getElementsByTagName("a")[0];
		setTimeout(function() {
			debug("goto search result (tv)");
			LS_putValue("expecting", "search_result");
			location.href = a.getAttribute("data-href");
		}, clickTimeout);
	}, displayTimeout);
	return;
}

if (document.URL.indexOf(url_search_tv) === 0 && isExpectingPage("search_result")) {
	setTimeout(parseSearchResult, displayTimeout, nextTitle, nextKeyword);
	return;
}

function nextTitle() {
	debug("nextTitle");
	if (nextTitle0()) {
		searchTitle();
		return;
	}
	nextKeyword();
}

function nextTitle0() {
	var indexOfTitles = parseInt(LS_getValue("indexOfTitles"));
	if (!(indexOfTitles >= 0)) {
		console.log("ERROR: indexOfTitles == " + indexOfTitles)
		return false;
	}
	if (indexOfTitles === 0) {
		return false;
	}
	indexOfTitles--;
	LS_putValue("indexOfTitles", indexOfTitles);
	return true;
}

function searchTitle() {
	var indexOfTitles = parseInt(LS_getValue("indexOfTitles"));
	var title = strip(LS_getValue("title" + indexOfTitles));
	var crid = strip(LS_getValue("crid" + indexOfTitles));
	trace("searchTitle", indexOfTitles, title, crid)
	if (!checkTitlePre2(title)) {
		setTimeout(nextTitle, 0);
		return;
	}
	setTimeout(function() {
		debug("goto title detail");
		LS_putValue("expecting", "title_detail");
		location.href = "/tv/detail/" + crid;
	}, clickTimeout);
}

if (document.URL.indexOf(url_detail) === 0 && isExpectingPage("title_detail", "reserve_recording")) {
	setTimeout(handleTitleDetail, displayTimeout, nextTitle, nextTitle);
	return
}

if (document.URL.indexOf(url_recording_confirm) === 0 && isExpectingPage("reserve_recording")) {
	setTimeout(handleConfirmReservation, displayTimeout, nextTitle, nextTitle);
	return
}

if (document.URL.indexOf(url_recording_complete) === 0 && isExpectingPage("title_detail", "confirm_recording")) {
	setTimeout(handleCompleteReservation, displayTimeout, nextTitle, nextTitle);
	return
}

// ---------------------------- Auto-login transitions ----------------------------

if (document.URL.indexOf(url_login) === 0 && LS_getValue("expecting")) {
	setTimeout(function() {
		var aikotoba = document.getElementById("aikotoba");
		if (!aikotoba) {
			console.log("no password input box");
			return;
		}
		if (!aikotoba.value) {
			console.log("no password");
			return;
		}
		var form = document.getElementById("login_form1");
		var submit = form.getElementsByTagName("input")[2];
		setTimeout(function() {
			submit.click();
		}, clickTimeout);
	}, displayTimeout);
	return;
}

if (document.URL.indexOf(url_login_complete) === 0 && LS_getValue("expecting")) {
	var expecting = LS_getValue("expecting");
	if (expecting !== "reserve_recording") {
		console.log("WARN: unexpected login request in " + expecting);
		searchLoopEntry();
	}
	return;
}


// ---------------------------- Cancel-all transitions ----------------------------

if (document.URL === url_reservation_list) {
	var contents_member = document.getElementById("contents_member");
	var div = document.createElement("div");
	div.innerHTML = '<button style="float:right;">すべてキャンセル</button>';
	var button = div.getElementsByTagName("button")[0];
	button.addEventListener('click', function() {
		if (window.confirm('キャンセル可能な予約をすべてキャンセルしますか？')) {
			console.log("canceling reservation...");
			handleCancelReservation();
		}
	}, false);
	contents_member.appendChild(div);
	return;
}

function handleCancelReservation() {
	var tables = document.getElementsByTagName("table");
	for (var table of tables) {
		var asl = table.getElementsByTagName("a");
		for (var i = 0; i < asl.length; i++) {
			if (asl[i].textContent != "×") {
				continue;
			}
			var onclick = asl[i].getAttribute("onClick");
			setTimeout(function() {
				LS_putValue("expecting", "cancel");
				debug("goto cancel a title");
				var delReservedData = unsafeWindow.delReservedData;
				unsafeWindow.confirm = unsafeWindow.String;
				eval('{' + onclick + '}');
			}, clickTimeout);
			return;
		}
	}
	try {
		var p = document.getElementsByClassName("next")[0];
		var href = p.getElementsByTagName("a")[0].href;
		setTimeout(function() {
			debug("goto next page for cancel");
			LS_putValue("expecting", "cancel");
			location.href = href;
		}, clickTimeout);
		return;
	} catch (e) {}
	console.log("no items to cancel");
	location.href = url_reservation_list;
	return true;
}

if (document.URL.indexOf(url_reservation_list) === 0 && isExpectingPage("cancel")) {
	handleCancelReservation();
	return;
}

if (document.URL.indexOf(url_delete_complete) === 0 && isExpectingPage("cancel")) {
	handleCancelReservation();
	return;
}

console.log("WARN: no handlers found ...");
