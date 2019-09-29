// ==UserScript==
// @name         [lnkdmonkey] mass contact from search pages
// @namespace    https://github.com/1d10t/lnkdmonkey
// @version      0.3
// @author       Sergey S Yaglov
// @match        https://www.linkedin.com/search/results/people/*
// @include      https://www.linkedin.com/search/results/people/*
// @grant        https
// @run-at       context-menu
// @updateUrl    https://github.com/1d10t/lnkdmonkey/raw/master/mass-contact.js
// @downloadUrl  https://github.com/1d10t/lnkdmonkey/raw/master/mass-contact.js
// ==/UserScript==

(function() {
    'use strict';
    
    if(!confirm('Используя автоматизарованные средства для доступа к "Услугам" LinkedIn, Вы нарушаете п.8.2.m пользовательского соглашения. Продолжить?')) return;
    
    var contact_interval, restart_timeout, scroll_timeout;
    const
        qs = document.querySelector.bind(document),
        col = console.log.bind(console),
        coe = console.error.bind(console)
    ;
    function ce(t,a){ var f=document.createElement(t); for(var k in a) f.setAttribute(k,a[k]); return f; };
    function msge(s){ var e=qs('#mfe'); if(!e) e=ce('div',{id:'mfe',title:'linkedin mass contact status',style:'display:block;position:fixed;top:130px;left:0;writing-mode:vertical-rl;text-orientation:mixed;border:1px solid red;background:yellow;color:brown;padding:7px'}), qs('body').append(e); e.innerText=s; };

    msge('INIT MASS CONTACT');

    setInterval(function(){
            if(! /^https:\/\/www\.linkedin\.com\/search\/results\/people\//.test(window.location.href)){
                clearInterval(contact_interval), contact_interval = null;
                clearTimeout(restart_timeout), restart_timeout = null;
                clearTimeout(scroll_timeout), scroll_timeout = null;
                msge('STOP MASS CONTACT');
            }
    }, 500);

    function contact_all(){
        msge('RUN MASS CONTACT');
        // clear restart interval
        if(restart_timeout){
            clearTimeout(restart_timeout);
            restart_timeout = null;
        }
        // scroll to bottom of page to show pagination
        scroll_timeout = setTimeout(function(){
            window.scrollTo(0, document.body.scrollHeight-500);
        }, 2*1000);
        // enable contact interval
        contact_interval = setInterval(function(){
            //let eb = qs('button[aria-label*="Установить контакт"]');
            let eb = qs('button.search-result__action-button.search-result__actions--primary:not([disabled])');
            if(eb){
                msge('CLICK CONTACT');
                eb.click();
                setTimeout(function(){
                    if(qs('artdeco-modal.ip-fuse-limit-alert')){
                        msge('LIMIT ALERT FOUND');
                        qs('button.ip-fuse-limit-alert__primary-action').click();
                        clearInterval(contact_interval);
                        restart_timeout = setTimeout(contact_all, 60*60*1000);
                        return;
                    }
                    if(qs('section.modal input#email')){
                        msge('EMAIL INPUT FOUND');
                        eb.remove();
                        qs('button.send-invite__cancel-btn').click();
                        return;
                    }
                    //var eok = qs('div.send-invite__actions button.button-primary-large');
                    let eok = qs('div.send-invite button.ml1');
                    if(eok){
                        msge('CLICK OK BUTTON');
                        eok.click();
                    }else{
                        msge('NO OK BUTTON');
                        eb.remove();
                    }
                }, 2*1000);
            }else{
            	let en = qs('button.artdeco-pagination__button--next');
                if(en){
                    msge('CLICK NEXT PAGE BUTTON');
                    en.click();
                }else{
                    msge('NO NEXT PAGE BUTTON');
                }
            }
        }, 5*1000);
    }

    contact_all();

})();
