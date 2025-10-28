const electron = require('electron');
console.log('Type:', typeof electron);
console.log('Value:', electron);
console.log('Keys:', Object.keys(electron || {}));
