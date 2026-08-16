const { parseUserIntent } = require('./server/agents/orchestrator');

console.log("book biriyani:", parseUserIntent("book biriyani from vijayawada to hyderabad"));
console.log("book kaya:", parseUserIntent("book a kaya from vijayawada to hyderabad"));
console.log("book pan india:", parseUserIntent("book a pan india ticket from vijayawada to hyderabad code"));
