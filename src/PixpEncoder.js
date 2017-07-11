/*
  Ressources:
  https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String

*/


/**
* A binary pixp blob is composed of a study sidecar and at least one block.
* A study sidecar is composed of:
* - 4 bytes ( 1 unsigned int 32 ) to encode the study sidecar length
* - x bytes ( x/2 unsigned int 16 ) to encode the study sidecar as a unicode JSON string
*
* As a JSON object, the study sidecar is composed of 2 things:
* - an array with the first-byte index of each block
* - a study metadata object
* 
*
* A block is the concatenation of these 3 things:
* - 4 bytes ( 1 unsigned int 32 ) to encode the sidecar length
* - n bytes ( n/2 unsigned int 16 ) to encode the sidecar as a unicode JSON string
* - m bytes of data
* 
* Each block has a length of 4 + n + m bytes.
* The n and m sizes vary from one block to the other.
*
* As a JSON object, each block's sidecar is composed of 2 things:
* - the encodingMetadata, that carries info about data type ("int", "float", "json"), data nb of bytes per element (8, 16 , 32, 64) and if data is made of signed of unsigned data (true or false)
* - the metadata set by the user for this block
*/

class PixpEncoder {
  constructor(){
    // list of [ encoding metadata + original metadata]
    this._sidecarBuffers = []
    this._dataBuffers = [];
    this._studyMetadata = {};
  }
  
  
  /**
  * Add a new dataset to the encoder. It will add it after the other.
  * @param {Object} data - can be a typed array of an object. If an object, it will be converted into a JSON string
  * @param {Object} metadata - will be converted into a JSON string
  * @param {String} originalType - additional information about the original type of the data. In Pixpipe, this could be "Image2D" or "Image3D" so that this string could be used directly as a constructor.
  */
  addBlock( data, metadata, originalType = null ){
    var encoding = {};
    encoding.originalType = originalType;

    var dataBuffer = null;
    var metadataBuffer = null;
    
    // the data is a typed Array
    if( this._isTypedArray( data ) ){
      var spec = this._getTypedArraySpec(data)
      encoding.bytesPerElement = spec.bytesPerElement;
      encoding.dataType = spec.dataType;
      encoding.signed = spec.signed
      dataBuffer = data.buffer;
    }
    // the data is a complex object/number/string
    else{
      dataBuffer = this._objectToUnicodeBuffer( data ).buffer;
      encoding.bytesPerElement = 2; // unicode char
      encoding.dataType = "json";
      encoding.signed = false;
    }
    
    encoding.byteLength = dataBuffer.byteLength;
    
    var sidecar = {
      encodingMetadata: encoding,
      originalMetadata: metadata
    }
    
    var sidecarBuffer = this._objectToUnicodeBuffer( sidecar ).buffer;
    
    this._sidecarBuffers.push( sidecarBuffer );
    this._dataBuffers.push( dataBuffer )
  }
  
  
  setStudyMetadata( obj ){
    this._studyMetadata = obj;
  }
  
  
  blocksToBlob(){
    if( this._sidecarBuffers.length != this._dataBuffers.length ){
      console.warn( "The blob cannot be made. The amount of metadata obejct differs from the amount of data object");
      return;
    }
    
    // the positions first byte of each block. (and computing the total buffer size all at once)
    var blockStarts = []
    var bufferPosition = 0;
    
    for(var i=0; i<this._dataBuffers.length; i++){
      blockStarts.push( bufferPosition );
      
      // adding the size of both buffer
      bufferPosition += (this._sidecarBuffers[i].byteLength + this._dataBuffers[i].byteLength);
      
      // adding 4 bytes (1 Uint32) for encoding block sidecar length
      bufferPosition += 4;
    }
    
    var studySidecar = {
      blockStarts: blockStarts,
      studyMetadata: this._studyMetadata
    }
    
    var studySidecarBuffer = this._objectToUnicodeBuffer( studySidecar ).buffer;
    
    var str = String.fromCharCode( ...(new Uint16Array(studySidecarBuffer)) );
    
    if( !studySidecarBuffer ){
      console.warn("Study metadata may contain cyclic reference, cannot create blob.");
      return;
    }

    var blobArray = [];

    
    // the size of the study sidecar
    blobArray.push( new Uint32Array([ studySidecarBuffer.byteLength ]).buffer )
    
    // the study sidecar
    blobArray.push( studySidecarBuffer )
    
    for(var i=0; i<this._dataBuffers.length; i++){
      // the block's sidecar length
      blobArray.push( new Uint32Array([ this._sidecarBuffers[i].byteLength ]).buffer );
      
      // the block's sidecar
      blobArray.push( this._sidecarBuffers[i] );
      
      // the block's data
      blobArray.push( this._dataBuffers[i] );
    }
    
    var finalBlob = new Blob( blobArray, {type: 'application/octet-binary'} );
    return finalBlob;
  }
  
  
  /**
  * Takes a JS object, convert it to a JSON string, and then to a Uint16Array that corresponds to 
  * a unicode string
  */
  _objectToUnicodeBuffer( obj ){
    var buffer = null;
    var jsonStr = this._toJsonString( obj );
    buffer = this._stringToUnicodeBuffer( jsonStr );
    return buffer;
  }
  
  
  /**
  * Takes a String and convert it into a Uint16Array buffer that represent a unicode buffer
  * @param {String} str - the string to encode
  * @return {Uint16Array} the unicode buffer
  */
  _stringToUnicodeBuffer( str ){
    if( !str )
      return null;
    
    var buffer = new Uint16Array(str.length); // 2 bytes for each char
    for (var i=0; i < str.length; i++) {
      buffer[i] = str.charCodeAt(i);
    }
    return buffer;
  }
  
  
  /**
  * [PRIVATE]
  * Convert an object into a JSON string. Returns null in case of failure (ie. cyclic reference)
  * @param {Object} obj - a JS object or array
  * @return {String} the stringified JSON result
  */
  _toJsonString( obj ){
    var jsonStr = null;
    
    try{
      jsonStr = JSON.stringify( obj );
    }catch(e){
      console.warn(e);
    }
    return jsonStr;
  }
  
  
  /**
  * [PRIVATE]
  * Tells if an object is a typed array
  * @param {Object} obj - object to test if it's a typed array
  * @return {Boolean} true if a typed array, false if not
  */
  _isTypedArray( obj ){
    if( !obj )
      return false;
      
    return (
      obj instanceof Int8Array ||
      obj instanceof Uint8Array ||
      obj instanceof Uint8ClampedArray ||
      obj instanceof Int16Array ||
      obj instanceof Uint16Array ||
      obj instanceof Int32Array ||
      obj instanceof Uint32Array ||
      obj instanceof Float32Array ||
      obj instanceof Float64Array );
  }
  
  
  /**
  * Get infomation about the data used in a typed array:
  * - nb bytes per element
  * - data type: float or int
  * - signed or unsigned
  */
  _getTypedArraySpec( arr ){
    
    var spec = {
      bytesPerElement: arr.BYTES_PER_ELEMENT,
      dataType: null,
      signed: null
    }
    
    if( arr instanceof Int8Array ){
      spec.dataType = "int";
      spec.signed = false;
    }else if(arr instanceof Uint8Array){
      spec.dataType = "int";
      spec.signed = true;
    }else if(arr instanceof Uint8ClampedArray){
      spec.dataType = "int";
      spec.signed = true;
    }else if(arr instanceof Int16Array){
      spec.dataType = "int";
      spec.signed = false;
    }else if(arr instanceof Uint16Array){
      spec.dataType = "int";
      spec.signed = true;
    }else if(arr instanceof Int32Array){
      spec.dataType = "int";
      spec.signed = false;
    }else if(arr instanceof Uint32Array){
      spec.dataType = "int";
      spec.signed = true;
    }else if(arr instanceof Float32Array){
      spec.dataType = "float";
      spec.signed = false;
    }else if(arr instanceof Float64Array){
      spec.dataType = "float";
      spec.signed = false;
    }
    
    return spec;
  }
  
  
} /* END of class PixpEncoder */

export { PixpEncoder }
