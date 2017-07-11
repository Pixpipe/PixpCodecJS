
class PixpDecoder {
  
  constructor(){
    
  }
  
  blobToBlocks( blob ){
    
    var fileReader = new FileReader();
    
    fileReader.onload = function() {
        var inputBuffer = this.result;
        var view = new DataView( inputBuffer, true );
        
        // size of the study sidecar
        var studySidecarLength = view.getUint32( 0 );
        var studySidecarBuffer = new Uint16Array( inputBuffer.slice( 4, 4 + studySidecarLength ) );
        var studySidecar = String.fromCharCode( ...studySidecarBuffer );
        console.log( studySidecar );
        
    };
    fileReader.readAsArrayBuffer(blob);
  }
  
} /* END of class PixpDecoder */

export { PixpDecoder }
