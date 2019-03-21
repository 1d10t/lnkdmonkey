// ==UserScript==
// @name         [lnkdmonkey] walk new and outdated contacts, then generate VCF
// @namespace    http://tampermonkey.net/
// @version      0.1
// @author       Sergey S Yaglov
// @match        https://www.linkedin.com/mynetwork/invite-connect/connections/*
// @include      https://www.linkedin.com/mynetwork/invite-connect/connections/*
// @grant        https
// @run-at       context-menu
// @updateUrl    https://github.com/1d10t/lnkdmonkey/raw/master/walk-and-generate-vcf.js
// @downloadUrl  https://github.com/1d10t/lnkdmonkey/raw/master/walk-and-generate-vcf.js
// ==/UserScript==

(function() {
    'use strict';

    if(!confirm('Используя автоматизарованные средства для доступа к "Услугам" LinkedIn, Вы нарушаете п.8.2.m пользовательского соглашения. Продолжить?')) return;

    // GET LIST
    var dd = [].map.call(document.querySelectorAll('div.mn-connection-card'), function(card){
        var d = {
            name: card.querySelector('span.mn-connection-card__name').innerText,
            url: card.querySelector('a.mn-connection-card__link').href.toString(),
            occupation: card.querySelector('span.mn-connection-card__occupation').innerText
        };
        d.uri = d.url.match(/\/in\/([^/]+)\//)[1];
        return d;
    });


    // INITIAL STORE
    var db, store, connection = indexedDB.open('LinkedInContacts', 1);
    connection.onsuccess = function(event) {
        console.log('db connected');
        db = event.target.result;
        store = get_idb_store();
        load_contacts(dd, walk_outdated_contacts);
    };
    connection.onerror = function(event) {
        console.log('db connect error', event);
    };
    connection.onupgradeneeded = function(event) {
        console.log('db upgrade');
        var db = event.target.result;
        var store = db.createObjectStore('contacts', { keyPath: 'uri' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('loaded', 'loaded', { unique: false });
    };

    function get_idb_store(){
        return db.transaction(['contacts'], 'readwrite').objectStore('contacts');
    }

    function load_contacts(dd, onload){
        var wait = dd.length;
        dd.map(function(d){
            console.log('check contact', d.name);
            var r = store.get(d.uri);
            r.onsuccess = function(event) {
                if(r.result){
                    console.log('has contact', r.result);
                    wait--;
                }else{
                    d.loaded = 0;
                    console.log('add contact', d);
                    store.add(d).onsuccess = function(){ wait--; };
                }
            };
        });
        var wait_interval = setInterval(function(){
            if(wait > 0) return;
            clearInterval(wait_interval);
            onload();
        }, 100);
    }


    Array.prototype.shuffle = function(slightly) {
        var _s = function(){ return Math.random()-0.5; };
        for(var i = 0; i < (slightly == undefined || !slightly ? this.length/2 : 1); i++)
            this.sort(_s);
        return this;
    };

    function unix_timestamp(){
        return parseInt(Date.now()/1000);
    }

    function wait_nav(url){
        return new Promise(function(resolve){
            var
            i = setInterval(function(){
                if(window.location.href.indexOf(url) > -1){
                    clearInterval(i);
                    clearTimeout(t);
                    resolve(true);
                }
            }, 100),
                t = setTimeout(function(){
                    clearInterval(i);
                    resolve(false);
                }, 10000)
            ;
        });
    }

    function walk_outdated_contacts(){
        store = get_idb_store();
        var upperBoundOpenKeyRange = IDBKeyRange.upperBound(unix_timestamp()-30*24*3600);
        var index = store.index('loaded');
        var uris = [];
        var do_walk = async function(){
            var router = await get_router();
            uris = uris.shuffle();
            while(uris.length){
                var uri = uris.shift(), url = '/in/'+uri;
                var transition = router.transitionTo(url);
                var nav_ok = await wait_nav(url);
                console.log('navigation to',url,'is',nav_ok);
                if(!nav_ok){
                    if(window.location.href.indexOf('/in/unavailable/') > 0){
                        get_idb_store().delete(uri);
                    }
                    continue;
                }
                await (function(){ return new Promise(function(resolve){ setTimeout(function(){ resolve(); }, 1000); }) })();
                var url2 = url + '/detail/contact-info';
                transition = router.transitionTo(url2);
                nav_ok = await wait_nav(url2);
                console.log('navigation to',url2,'is',nav_ok);
                if(!nav_ok) continue;
                await (function(){ return new Promise(function(resolve){ setTimeout(function(){ resolve(); }, 1000); }) })();
                var rows = await read_user_contacts();
                await (function(){ return new Promise(function(resolve){
                    var store = get_idb_store();
                    store.get(uri).onsuccess = function(e) {
                        var obj = e.target.result;
                        obj.rows = rows;
                        obj.loaded = unix_timestamp();
                        store.put(obj).onsuccess = resolve;
                    }
                }) })();
            }
        };
        index.openCursor(upperBoundOpenKeyRange).onsuccess = async function(event) {
            var cursor = event.target.result;
            if (!cursor){
                await do_walk();
                console.log('walking done');
                generate_vcard_file();
                return;
            }
            // Do something with the matches.
            console.log('outdated contact', cursor.value.uri, cursor.value.name);
            uris.push(cursor.value.uri);
            cursor.continue();
        };
    }



    // https://www.linkedin.com/mynetwork/invite-connect/connections/
    function get_router(){
        if(window.router) return window.router;
        window.oldembergetowner = Ember.getOwner;
        var obj, link = document.querySelector('#nav-settings__dropdown button');

        Ember.getOwner = function(e){
            var result = window.oldembergetowner(e);
            //debugger;
            if(!window.emberowner){
                window.emberowner = result;
                console.log('has ember owner', window.emberowner);
                window.router = window.emberowner.router;
                console.log('has router', window.router);
            }
            return result;
        }
        link.click();
        return new Promise(function(resolve) {
            var wait_interval = setInterval(function(){
                if(!window.router) return;
                clearInterval(wait_interval);
                resolve(window.router);
            }, 100);
        });
    }




    async function read_user_contacts(){
        var lines = [], promises = [];

        lines.push(['ADR', ['','',document.querySelector('h3.pv-top-card-section__location').innerText,'','',''], {'TYPE': 'WORK'}]);
        lines.push(['UID', 'LIN-'+window.location.href.match(/\/in\/([^/]+)/)[1]]);
        lines.push(['REV', (new Date()).toISOString()]);

        var
            name = document.querySelector('h1.pv-top-card-section__name').innerText.trim(),
            sname = name.split(' ', 2)
        ;
        sname.unshift(sname.pop());
        lines.push(['FN', name]);
        lines.push(['N', sname]);

        var e = document.querySelector('span.pv-top-card-v2-section__company-name');
        if(e) lines.push(['ORG', e.innerText]);

        e = document.querySelector('h2.pv-top-card-section__headline');
        if(e) lines.push(['TITLE', e.innerText]);

        var b = document.querySelector('button.pv-top-card-section__summary-toggle-button');
        if(b){
            b.click();
            promises.push(new Promise(function(resolve){
                setTimeout(function(){
                    lines.push(['NOTE', document.querySelector('p.pv-top-card-section__summary-text span.lt-line-clamp__raw-line').innerText]);
                    resolve();
                }, 1000);
            }));
        }

        e = document.querySelector('div.pv-top-card-section__photo:not(.ghost-person)');
        if(e){
            promises.push(new Promise(function(resolve){
                var canvas = document.createElement('canvas'), ctx2d = canvas.getContext('2d'), img = new Image();
                canvas.width = canvas.height = 96;
                img.crossOrigin = 'Anonymous'
                img.src = e.style.backgroundImage.match(/url\("([^"]+)"\)/)[1];
                img.onload = function(){
                    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
                    var data_url = canvas.toDataURL("image/jpeg", 0.75);
                    canvas.remove();
                    lines.push(['PHOTO', data_url.replace('data:image/jpeg;base64,', ''), {ENCODING:'b',TYPE:'JPEG'}]);
                    img.remove();
                    resolve();
                };
            }));
        }

        // PHOTO;ENCODING=b;TYPE=JPEG:MIICajCCAdOgAwIBAgICBEUwDQYJKoZIhvc


        [].map.call(document.querySelectorAll('section.pv-contact-info section.pv-contact-info__contact-type'), function(e_type){
            console.log('reading contact line from', e_type);
            var type = e_type.className.match(/\bci-([^\s]*)/)[1];

            [].map.call(e_type.querySelectorAll('.pv-contact-info__ci-container'), function(e){

                var
                full_value = e.innerText.trim(),
                    strip_value,
                    value_subtype,
                    value
                ;

                if(type == 'wechat'){
                    strip_value = e.querySelector('span.pv-wechat__nickname').innerText.trim();
                }else{
                    strip_value = e.querySelector('.t-normal').innerText.trim();
                    value_subtype = full_value.replace(strip_value, '').trim();
                }

                switch(type){
                    case 'phone':
                        value = ['TEL', strip_value.replace(/[^0-9a-zА-Яа-яЁё\w\+\/#]/gi,'')];
                        // array('TYPE'=>'VOICE,CELL,HOME,WORK,MSG')
                        if(value_subtype == '(Рабочий)'){
                            value.push({'TYPE': 'WORK'});
                        }else if(value_subtype == '(Мобильный)'){
                            value.push({'TYPE': 'CELL'});
                        }else if(value_subtype == '(Домашний)'){
                            value.push({'TYPE': 'HOME'});
                        }
                        break;
                    case 'email':
                        value = ['EMAIL', strip_value, {'TYPE': 'INTERNET'}];
                        break;
                    case 'wechat':
                        value = ['NICKNAME', strip_value+' (WeChat)'];
                        break;
                    case 'ims':
                        value = ['NICKNAME', full_value];
                        break;
                    case 'vanity-url':
                        value = ['URL', 'https://'+strip_value];
                        break;
                    case 'websites':
                        value = ['URL', 'http://'+strip_value];
                        break;
                    case 'twitter':
                        value = ['URL', 'https://twitter.com/'+strip_value];
                        break;
                    case 'address':
                        value = ['ADR', ['','',strip_value,'','','']];
                        break;
                    case 'connected':
                        // date connected
                        break;
                    case 'birthday':
                        // 6 сентября
                        // (\d{4})(\d{2})(\d{2}) // array('BDAY', "{$t[1]}-{$t[2]}-{$t[3]}")
                        // (new Date('09-6')).toString() = Thu Sep 06 2001 00:00:00 GMT+0400 (Москва, летнее время)
                        break;
                    default:
                        console.log('unknown contact type', type, full_value, e_type);
                }

                if(value) lines.push(value);
            });

        });

        await Promise.all(promises);

        return lines;
    }


    String.prototype.replaceAll = function(search, replacement) {
        var target = this;
        return target.split(search).join(replacement);
    };

    function vc_escape_arg(str){
        var tr = {"\r\n": '\\n', "\n": '\\n', ',': '\\,', ';': '\\;', ':': '\\:'};
        for(var k in tr){
            str = str.replaceAll(k, tr[k]);
        }
        return str;
    }

    function vc_line(type, args, params){
        if(typeof(params) == 'undefined') params = {};
        if(typeof(args) != 'object') args = [args];
        var s = type;
        for(var k in params){
            var v = params[k];
            //console.log('param', k, '=', v);
            s += ';' + k + '=' + (typeof(v) == 'object' ? v.join(',') : v);
        }
        s += ':' + args.map(vc_escape_arg).join(';');
        return s;
    }

    function vc(data_rows){

        var rows = [].concat.call([['BEGIN','VCARD'],['VERSION','3.0']], data_rows, [['END','VCARD']]);

        //console.log('rows',rows);

        var s = '';

        for(var row of rows){
            //console.log('row',row);
            s += vc_line.apply(this, row) + "\r\n";
        }

        return s;
    }

    function get_file(data, filename, mime){
        if(!mime) mime = 'application/octet-stream';

        var
        url = window.URL.createObjectURL(new Blob([data], {type: mime})),
            a = document.createElement('a')

        ;
        a.href = url;
        a.download = filename;
        a.click();

        setTimeout(function(){
            a.remove();
            window.URL.revokeObjectURL(url);
        }, 1000);

    }

    function generate_vcard_file(){
        get_idb_store().getAll().onsuccess = (e => {
            var s = '';
            for(var contact of e.target.result)
                if(contact.rows){
                    s += vc(contact.rows);
                };
            get_file(s, 'linkedin-contacts.vcf', 'text/vcard');
        });
    }
})();