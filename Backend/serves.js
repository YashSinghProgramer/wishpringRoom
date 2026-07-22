const { httpServer } = require("./src/app");

httpServer.listen(3600, () => {
	console.log("Server running on port 3600");
});
