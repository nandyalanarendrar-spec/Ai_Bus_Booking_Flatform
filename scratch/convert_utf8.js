const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../bus-owner/src/pages/DashboardPage.tsx');

try {
  const buf = fs.readFileSync(targetPath);
  let str;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    str = buf.toString('utf16le');
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    str = buf.toString('utf16be');
  } else {
    str = buf.toString('utf8');
  }
  
  // Clean BOM if present
  if (str.charCodeAt(0) === 0xFEFF) {
    str = str.substring(1);
  }

  fs.writeFileSync(targetPath, str, 'utf8');
  console.log('Successfully converted DashboardPage.tsx to clean UTF-8! Size:', str.length);
} catch (err) {
  console.error('Error converting file:', err);
}
