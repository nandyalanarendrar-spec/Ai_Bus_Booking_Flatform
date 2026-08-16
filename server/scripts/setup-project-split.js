const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const parentDir = path.dirname(rootDir);

const project1Dir = path.join(parentDir, 'prajwalan_project1');
const project2Dir = path.join(parentDir, 'prajwalan_project2');

const ignoreList = ['node_modules', '.git', '.vscode', 'busgo.db', 'app.db', 'test-app.db', 'test.txt'];

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);

  files.forEach((file) => {
    if (ignoreList.includes(file)) return;

    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);

    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  });
}

console.log('🚀 Step 1: Copying project files to prajwalan_project1...');
copyFolderRecursiveSync(rootDir, project1Dir);

console.log('🚀 Step 2: Copying project files to prajwalan_project2...');
copyFolderRecursiveSync(rootDir, project2Dir);

// Configure prajwalan_project1 (Cloud DB + Gemini API)
console.log('⚡ Step 3: Configuring prajwalan_project1 (Neon Cloud DB + Gemini API)...');
const envProject1 = `PORT=5000
EMAIL_USER=nnrreddy.123456789@gmail.com
EMAIL_APP_PASSWORD=kuvxnjnublmcnpik
DATABASE_URL=postgresql://neondb_owner:npg_6gRkFpGT3VYX@ep-small-heart-ax7a0aig.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require

AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-1.5-flash
`;

fs.writeFileSync(path.join(project1Dir, 'server', '.env'), envProject1, 'utf8');

// Remove temporary branch files from project1
['.env.narendra1', '.env.narendra2'].forEach(f => {
  const p = path.join(project1Dir, 'server', f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

// Configure prajwalan_project2 (Local DB + Ollama AI)
console.log('⚡ Step 4: Configuring prajwalan_project2 (Local PostgreSQL + Ollama AI)...');
const envProject2 = `PORT=5000
EMAIL_USER=nnrreddy.123456789@gmail.com
EMAIL_APP_PASSWORD=kuvxnjnublmcnpik
DATABASE_URL=postgres://postgres:narendra@127.0.0.1:5432/AI_busbooking_flatform

AI_PROVIDER=ollama
OLLAMA_HOST=127.0.0.1
OLLAMA_PORT=11434
OLLAMA_MODEL=llama3.2
`;

fs.writeFileSync(path.join(project2Dir, 'server', '.env'), envProject2, 'utf8');

// Remove temporary branch files from project2
['.env.narendra1', '.env.narendra2'].forEach(f => {
  const p = path.join(project2Dir, 'server', f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

// Update package.json in project1 to clean up unused scripts
function cleanPackageJson(pkgPath) {
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.scripts) {
      delete pkg.scripts['use:narendra1'];
      delete pkg.scripts['use:narendra2'];
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
  }
}

cleanPackageJson(path.join(project1Dir, 'package.json'));
cleanPackageJson(path.join(project1Dir, 'server', 'package.json'));
cleanPackageJson(path.join(project2Dir, 'package.json'));
cleanPackageJson(path.join(project2Dir, 'server', 'package.json'));

// Remove test.txt if it exists
[project1Dir, project2Dir].forEach(p => {
  const t = path.join(p, 'test.txt');
  if (fs.existsSync(t)) fs.unlinkSync(t);
});

console.log('✅ Separation completed successfully!');
console.log(`📁 prajwalan_project1 -> ${project1Dir}`);
console.log(`📁 prajwalan_project2 -> ${project2Dir}`);
