const fs = require('fs');
let content = fs.readFileSync('client/src/App.js', 'utf-8');

const startMatch = "  const InteractiveRawMessage = ({ m, mine, s, isPrivate, renderMedia, openPrivateChat, isOnline, onDelete, onForward, onReact, username }) => {";

const startIndex = content.indexOf(startMatch);

const endRegex = /  const LogoMark = \(\{ subtitle \}\) => \([\s\S]*?\r?\n  \);/;
const match = content.match(endRegex);

if (startIndex !== -1 && match) {
    const endIndex = match.index + match[0].length;
    const extracted = content.substring(startIndex, endIndex);
    
    // Remove it from current place
    content = content.substring(0, startIndex) + content.substring(endIndex);
    
    // Put it at the bottom, just before export default App;
    content = content.replace("export default App;", extracted + "\n\nexport default App;");
    
    fs.writeFileSync('client/src/App.js', content, 'utf-8');
    console.log('Successfully refactored components.');
} else {
    console.log('Could not find matches', startIndex, !!match);
}
