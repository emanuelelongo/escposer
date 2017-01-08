'use strict';
const escpos = require('../');
const printer = new escpos.Printer();

escpos.Image.load(__dirname + '/tux.png', function(image){
    
    printer
        .align('ct')
        .image(image, 'd24')    
        .cut();

    console.log(printer.getBuffer());
});