// ==UserScript==
// @name         [lnkdmonkey] scroll down contact list
// @namespace    http://tampermonkey.net/
// @version      0.1
// @author       Sergey S Yaglov
// @match        https://www.linkedin.com/mynetwork/invite-connect/connections/*
// @include      https://www.linkedin.com/mynetwork/invite-connect/connections/*
// @grant        https
// @run-at       context-menu
// @updateUrl    https://github.com/1d10t/lnkdmonkey/raw/master/scroll-down-contact-list.js
// @donnloadUrl  https://github.com/1d10t/lnkdmonkey/raw/master/scroll-down-contact-list.js
// ==/UserScript==

(function() {
    'use strict';

    if(!confirm('Используя автоматизарованные средства для доступа к "Услугам" LinkedIn, Вы нарушаете п.8.2.m пользовательского соглашения. Продолжить?')) return;

    // SCROLL LIST
    window.scrollTo(0, 0);
    var prev_pos = 0, scroll_interval = setInterval(function(){
        if(document.querySelector('section.mn-connections li-icon[type="loader"]')){
            console.log('loader running');
            return;
        }
        var
            max_pos = document.body.scrollHeight,
            next_page_pos = Math.floor(visualViewport.pageTop + visualViewport.height/2),
            next_pos = max_pos//Math.min(next_page_pos, max_pos)
        ;
        if(next_pos == prev_pos){
            //next_pos = Math.floor(visualViewport.pageTop - visualViewport.height/4);
            clearInterval(scroll_interval);
            console.log('scrolling done');
            return;
        }
        console.log('scroll to ', next_pos);
        window.scrollTo(0, next_pos);
        prev_pos = next_pos;
    }, 200);
})();