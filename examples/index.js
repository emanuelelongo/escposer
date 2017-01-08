'use strict';
const escpos = require('../');
const printer = new escpos.Printer();

printer
    .font('a')
    .align('ct')
    .style('bu')
    .size(1, 1)
    .text('Hello, World.')
    .barcode('12345678', 'EAN8')
    .qrimage('https://github.com/emanuelelongo/escposer', function(err){
      this.cut();
      console.log(printer.getBuffer());
    });