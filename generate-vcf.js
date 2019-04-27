// ==UserScript==
// @name         [lnkdmonkey] generate VCF
// @namespace    https://github.com/1d10t/lnkdmonkey
// @version      0.1
// @author       Sergey S Yaglov
// @match        https://www.linkedin.com/*
// @include      https://www.linkedin.com/*
// @grant        https
// @run-at       context-menu
// @updateUrl    https://github.com/1d10t/lnkdmonkey/raw/master/generate-vcf.js
// @downloadUrl  https://github.com/1d10t/lnkdmonkey/raw/master/generate-vcf.js
// ==/UserScript==

(function() {
    'use strict';
    
    let max_vcf_size_mb = 2;
    
    do{
    	max_vcf_size_mb = parseFloat(prompt('Type max VCF file size in MB for split', max_vcf_size_mb));
    }while(max_vcf_size_mb < 1);
    
    
    // INITIAL STORE
    var db, store, connection = indexedDB.open('LinkedInContacts', 1);
    connection.onsuccess = function(event) {
        console.log('db connected');
        db = event.target.result;
        store = get_idb_store();
        generate_vcard_file();
        if(confirm("Check your files in Downloads!\r\nSay Thank You -->")) window.location.href = 'https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=ZLRJHLVMQ9MEL&item_name=lnkdmonkey-donate&currency_code=EUR&source=url';
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
        	// max_vcf_size_mb
        	let tenc = new TextEncoder('utf-8'), size = 0, s = '', sc = 1, add_size, date = (new Date).toISOString().replace(/[:\.]/g,'-');
            for(var contact of e.target.result)
            if(contact.rows){
            	let
            		add_s = vc(contact.rows),
            		add_size = tenc.encode(add_s).length
            	;
            	if((size + add_size) > (max_vcf_size_mb * 1024 * 1024)){
            		get_file(s, 'linkedin-contacts-'+date+'-'+sc+'.vcf', 'text/vcard');
            		s = '';
            		size = 0;
            		sc++;
            	}
        		s += add_s;
        		size += add_size;
            }
            if(size){
            	get_file(s, 'linkedin-contacts-'+date+'-'+sc+'.vcf', 'text/vcard');
            }
        });
    }
    
    
})();