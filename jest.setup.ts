import "@testing-library/jest-dom";

// jsdom doesn't implement Blob/File.arrayBuffer() (every target browser does)
// - polyfill it via FileReader, which jsdom does support, for file-parsing tests.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
