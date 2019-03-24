// ==UserScript==
// @name         [lnkdmonkey] walk new and outdated contacts, then generate VCF
// @namespace    http://tampermonkey.net/
// @version      0.2
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
                link.click();
                resolve(window.router);
            }, 100);
        });
    }

    var phonecode_length = {
        "1": "10",
        "20": "10",
        "213": "9",
        "218": "10",
        "223": "8",
        "226": "8",
        "227": "8",
        "228": "8",
        "230": "8",
        "231": "7,8",
        "233": "9",
        "234": "8",
        "235": "8",
        "241": "7",
        "246": "7",
        "262": "9",
        "268": "8",
        "27": "9",
        "290": "4",
        "298": "5",
        "299": "6",
        "30": "10",
        "31": "9",
        "32": "9",
        "33": "9",
        "34": "9",
        "351": "9",
        "352": "9",
        "353": "9",
        "355": "9",
        "357": "8",
        "358": "10",
        "359": "9",
        "36": "9",
        "370": "8",
        "371": "8",
        "373": "8",
        "374": "6",
        "375": "9",
        "380": "9",
        "381": "8",
        "381": "9",
        "382": "8",
        "383": "8",
        "385": "9",
        "387": "8",
        "39": "10,13",
        "41": "9",
        "420": "9",
        "421": "9",
        "43": "10,11",
        "44": "10",
        "45": "8",
        "46": "7,10",
        "47": "8",
        "48": "9",
        "49": "10",
        "500": "5",
        "501": "6,7",
        "503": "7",
        "506": "8",
        "507": "8",
        "51": "9",
        "52": "10",
        "55": "11",
        "56": "9",
        "57": "10",
        "58": "7",
        "593": "9",
        "594": "9",
        "596": "9",
        "60": "7",
        "61": "9",
        "62": "9,10",
        "63": "10",
        "64": "9",
        "65": "8",
        "66": "9",
        "670": "8",
        "672": "6",
        "677": "7",
        "680": "7",
        "682": "5",
        "683": "4",
        "686": "5",
        "687": "6",
        "689": "6",
        "691": "7",
        "692": "7",
        "7": "10",
        "84": "9",
        "852": "8",
        "855": "9",
        "86": "11",
        "880": "10",
        "886": "9",
        "90": "7,11",
        "91": "10",
        "92": "10",
        "93": "9",
        "94": "7",
        "95": "8,10",
        "960": "7",
        "963": "9",
        "965": "8",
        "966": "9",
        "967": "9",
        "968": "8",
        "970": "9",
        "971": "9",
        "972": "9",
        "973": "8",
        "974": "8",
        "976": "8",
        "977": "10",
        "98": "10",
        "995": "9",
    };

    var location_phonecode = {
        "Украина": "380",
        "Россия": "7",
        "Netherlands": "31",
        "San Francisco Bay Area": "1",
        "Greater New York City Area": "1",
        "California": "1",
        "Germany": "49",
        "Spain": "34",
        "New York": "1",
        "New Jersey": "1",
        "Беларусь": "375",
        "India": "91",
        "Индия": "91",
        "United Kingdom": "44",
        "Connecticut": "1",
        "Армения": "374",
        "США": "1",
        "Washington": "1",
        "Великобритания": "44",
        "Израиль": "972",
        "ОАЭ": "971",
        "Greater Seattle Area": "1",
        "Poland": "48",
        "Washington D.C. Metro Area": "1",
        "Ирландия": "353",
        "Испания": "34",
        "Thailand": "66",
        "Moldova": "373",
        "Texas": "1",
        "Greater Los Angeles Area": "1",
        "Philippines": "63",
        "Эстония": "372",
        "Bulgaria area": "41",
        "Ohio Area": "1",
        "Greater Atlanta Area": "1",
        "Greater Chicago Area": "1",
        "Switzerland": "41",
        "Аргентина": "54",
        "Казахстан": "7",
        "Канада": "1",
        "Нигерия": "234",
        "Пакистан": "92",
        "Саудовская Аравия": "966",
        "Филиппины": "63",
        "Belgium": "32",
        "Virginia": "1",
        "Austria area": "44",
        "Pennsylvania": "1",
        "Michigan": "1",
        "Florida": "1",
        "Canada": "49",
        "South Africa": "358",
        "Arizona": "1",
        "Ukraine": "380",
        "Illinois": "1",
        "Cincinnati Area": "1",
        "Dallas/Fort Worth Area": "1",
        "Australia": "61",
        "Greater Boston Area": "1",
        "Greater Denver Area": "1",
        "Greater Philadelphia Area": "1",
        "Greater Pittsburgh Area": "1",
        "Greater San Diego Area": "1",
        "Greater St. Louis Area": "1",
        "Finland": "48",
        "Missouri Area": "1",
        "Malaysia": "60",
        "Miami/Fort Lauderdale Area": "1",
        "Minnesota": "1",
        "Delaware": "1",
        "Oregon": "1",
        "RU": "7",
        "North Carolina": "1",
        "Israel": "972",
        "Brazil": "55",
        "Ireland": "353",
        "Canada Area": "1",
        "District Of Columbia": "1",
        "Massachusetts": "1",
        "China": "86",
        "Азербайджан": "994",
        "Венгрия": "36",
        "Гонконг": "852",
        "Грузия": "995",
        "Доминиканская Республика": "1829",
        "Египет": "20",
        "Индонезия": "62",
        "Катар": "974",
        "Латвия": "371",
        "Италия": "39",
        "Сингапур": "65",
        "Узбекистан": "998",
        "Финляндия": "358",
        "Чешская Республика": "420",
        "Шри-Ланка": "94"
    };

    function get_international_phonecode_for_location(location){
        var ls = location.split(', ');
        for(let i=0; i<ls.length; i++){ // 0, 1, 2
            let l = ls.slice(i).join(', ');
            if(typeof(location_phonecode[l]) != 'undefined') return location_phonecode[l];
        }
    }
    
    function fix_international_phone(phone, location){
        //'0079057461132x123'.match(/(\+?)((\d*)(\d{10}))(\b|[^\d])/)
        //(6) ["0079057461132x", "", "0079057461132", "007", "9057461132", "x", index: 0, input: "0079057461132x123", groups: undefined]
        var int_code = get_international_phonecode_for_location(location);
        if(!int_code){
            console.log('no international phone code for', location);
            return phone;
        }
        var int_len = phonecode_length[int_code];
        //var t = phone.match(/(\+?)((\d*)(\d{10}))(\b|[^\d])/);
        var t = phone.match(new RegExp('(\\+?|\\b)((\\d*)(\\d{'+int_len+'}))(?:\\b|[^\\d])'));
        if(!t || t[1] == '+') return phone;
        return phone.replace(t[2], '+'+int_code+t[4]);
    }



    async function read_user_contacts(){
        var lines = [], promises = [];
        var work_location = document.querySelector('h3.pv-top-card-section__location').innerText;

        lines.push(['ADR', ['','',work_location,'','',''], {'TYPE': 'WORK'}]);
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
                    	var phone = fix_international_phone(strip_value.replace(/[^0-9a-zА-Яа-яЁё\w\+\/#]/gi,''), work_location);
                        value = ['TEL', phone];
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