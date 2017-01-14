'use strict';
const util         = require('util');
const qr           = require('qr-image');
const iconv        = require('iconv-lite');
const getPixels    = require('get-pixels');
const Buffer       = require('mutable-buffer');
const EventEmitter = require('events');
const Image        = require('./image');
const _            = require('./commands');

function Printer(){
  if (!(this instanceof Printer)) {
    return new Printer();
  }
  var self = this;
  EventEmitter.call(this);
  this.buffer = new Buffer();
};

util.inherits(Printer, EventEmitter);

Printer.prototype.print = function(content){
  this.buffer.write(content);
  return this;
};

Printer.prototype.println = function(content){
  return this.print([ content, _.EOL ].join(''));
};

Printer.prototype.text = function(content, encoding){
  return this.print(iconv.encode(content + _.EOL, encoding || 'GB18030'));
};

Printer.prototype.feed = function (n) {
  this.buffer.write(new Array(n || 1).fill(_.EOL).join(''));
  return this;
};

Printer.prototype.control = function(ctrl){
  this.buffer.write(_.FEED_CONTROL_SEQUENCES[
    'CTL_' + ctrl.toUpperCase()
  ]);
  return this;
};

Printer.prototype.align = function(align){
  this.buffer.write(_.TEXT_FORMAT[
    'TXT_ALIGN_' + align.toUpperCase()
  ]);
  return this;
};

Printer.prototype.font = function(family){
  this.buffer.write(_.TEXT_FORMAT[
    'TXT_FONT_' + family.toUpperCase()
  ]);
  return this;
};

Printer.prototype.style = function(type){
  switch(type.toUpperCase()){
    case 'B':
      this.buffer.write(_.TEXT_FORMAT.TXT_UNDERL_OFF);
      this.buffer.write(_.TEXT_FORMAT.TXT_BOLD_ON);
      break;
    case 'U':
      this.buffer.write(_.TEXT_FORMAT.TXT_BOLD_OFF);
      this.buffer.write(_.TEXT_FORMAT.TXT_UNDERL_ON);
      break;
    case 'U2':
      this.buffer.write(_.TEXT_FORMAT.TXT_BOLD_OFF);
      this.buffer.write(_.TEXT_FORMAT.TXT_UNDERL2_ON);
      break;
    case 'BU':
      this.buffer.write(_.TEXT_FORMAT.TXT_BOLD_ON);
      this.buffer.write(_.TEXT_FORMAT.TXT_UNDERL_ON);
      break;
    case 'BU2':
      this.buffer.write(_.TEXT_FORMAT.TXT_BOLD_ON);
      this.buffer.write(_.TEXT_FORMAT.TXT_UNDERL2_ON);
      break;
    case 'NORMAL':
    default:
      this.buffer.write(_.TEXT_FORMAT.TXT_BOLD_OFF);
      this.buffer.write(_.TEXT_FORMAT.TXT_UNDERL_OFF);
      break;
  }
  return this;
};

Printer.prototype.size = function(width, height){
  this.buffer.write(_.TEXT_FORMAT.TXT_NORMAL);
  if(width == 2)  this.buffer.write(_.TEXT_FORMAT.TXT_2WIDTH);
  if(height == 2) this.buffer.write(_.TEXT_FORMAT.TXT_2HEIGHT);
  return this;
};

Printer.prototype.lineSpace = function(n) {
  if (n === undefined || n === null) {
    this.buffer.write(_.LINE_SPACING.LS_DEFAULT);
  } else {
    this.buffer.write(_.LINE_SPACING.LS_SET);
    this.buffer.writeUInt8(n);
  }
  return this;
};

Printer.prototype.hardware = function(hw){
  this.buffer.write(_.HARDWARE[ 'HW_'+ hw ]);
  return this;
};

Printer.prototype.barcode = function(code, type, width, height, position, font){
  if(width >= 1 || width <= 255){
    this.buffer.write(_.BARCODE_FORMAT.BARCODE_WIDTH);
  }
  if(height >=2  || height <= 6){
    this.buffer.write(_.BARCODE_FORMAT.BARCODE_HEIGHT);
  }
  this.buffer.write(_.BARCODE_FORMAT[
    'BARCODE_FONT_' + (font || 'A').toUpperCase()
  ]);
  this.buffer.write(_.BARCODE_FORMAT[
    'BARCODE_TXT_' + (position || 'BLW').toUpperCase()
  ]);
  this.buffer.write(_.BARCODE_FORMAT[
    'BARCODE_' + ((type || 'EAN13').replace('-', '_').toUpperCase())
  ]);
  this.buffer.write(code);
  return this;
};

Printer.prototype.qrcode = function(code, version, level, size){
  this.buffer.write(_.CODE2D_FORMAT.TYPE_QR);
  this.buffer.write(_.CODE2D_FORMAT.CODE2D);
  this.buffer.writeUInt8(version || 3);
  this.buffer.write(_.CODE2D_FORMAT[
    'QR_LEVEL_' + (level || 'L').toUpperCase()
  ]);
  this.buffer.writeUInt8(size || 6);
  this.buffer.writeUInt16LE(code.length);
  this.buffer.write(code);
  return this;
};

Printer.prototype.qrimage = function(content, options, callback){
  var self = this;
  if(typeof options == 'function'){
    callback = options;
    options = null;
  }
  options = options || { type: 'png', mode: 'dhdw' };
  var buffer = qr.imageSync(content, options);
  var type = [ 'image', options.type ].join('/');
  getPixels(buffer, type, function (err, pixels) {
    if(err) return callback && callback(err);
    self.raster(new Image(pixels), options.mode);
    callback && callback.call(self, null, self);
  });
  return this;
};

Printer.prototype.image = function(image, density){
  if(!(image instanceof Image)) 
    throw new TypeError('Only escpos.Image supported');
  density = density || 'd24';
  var n = !!~[ 'd8', 's8' ].indexOf(density) ? 1 : 3;
  var header = _.BITMAP_FORMAT['BITMAP_' + density.toUpperCase()];
  var bitmap = image.toBitmap(n * 8);
  var self = this;
  this.lineSpace(0); // set line spacing to 0
  bitmap.data.forEach(function (line) {
    self.buffer.write(header);
    self.buffer.writeUInt16LE(line.length / n);
    self.buffer.write(line);
    self.buffer.write(_.EOL);
  });
  return this.lineSpace();
};

Printer.prototype.raster = function (image, mode) {
  if(!(image instanceof Image)) 
    throw new TypeError('Only escpos.Image supported');
  mode = mode || 'normal';
  if (mode === 'dhdw' || 
      mode === 'dwh'  || 
      mode === 'dhw') mode = 'dwdh';
  var raster = image.toRaster();
  var header = _.GSV0_FORMAT['GSV0_' + mode.toUpperCase()];
  this.buffer.write(header);
  this.buffer.writeUInt16LE(raster.width);
  this.buffer.writeUInt16LE(raster.height);
  this.buffer.write(raster.data);
  return this;
};

Printer.prototype.cut = function(part, feed){
  this.feed(feed || 3);
  this.buffer.write(_.PAPER[
    part ? 'PAPER_PART_CUT' : 'PAPER_FULL_CUT'
  ]);
  return this;
};

Printer.prototype.cashdraw = function(pin){
  this.buffer.write(_.CASH_DRAWER[
    'CD_KICK_' + (pin || 2)
  ]);
  return this;
};

Printer.prototype.getData = function() {
  let arr = [];
  for (var i = 0; i < this.buffer._size; ++i) {
      arr[i] = this.buffer.buffer[i];
  }
  return arr;
}

module.exports = Printer;
