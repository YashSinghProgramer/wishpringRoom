const express = require("express");
const cors = require("cors");
const dns = require("dns");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const UserModel = require("../Components/Mongodb");
const app = express();
const allowedOrigins = [
	"https://whisper-six-pi.vercel.app",
	"http://localhost:5173",
];
const corsOptions = {
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.includes(origin)) {
			callback(null, true);
		} else {
			callback(new Error("CORS Error: Access Denied"));
		}
	},
	methods: ["GET", "POST", "PUT", "DELETE"],
	credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
const authenticateToken = (req, res, next) => {
	const authHeader = req.headers["authorization"];
	const token = authHeader && authHeader.split(" ")[1];

	if (!token) {
		return res.status(401).json({ message: "Access Token missing!" });
	}

	jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
		if (err) {
			return res.status(403).json({ message: "Invalid or expired token!" });
		}
		req.user = decodedUser;
		next();
	});
};
const JWT_SECRET = process.env.JWT_SECRET || "wisperRooms";

app.get("/", (req, res) => {
	res.send("Hello, world");
});

app.post("/createuser", async (req, res) => {
	try {
		const { username, Password, profile } = req.body;

		if (!username || !Password) {
			return res
				.status(400)
				.json({ message: "Username and Password are required!" });
		}

		const existingUser = await UserModel.findOne({ username });
		if (existingUser) {
			return res.status(400).json({ message: "Username already exists!" });
		}

		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(Password, salt);

		const newUser = new UserModel({
			username,
			Password: hashedPassword,
			profile,
		});

		await newUser.save();
		res
			.status(201)
			.json({ message: "User created successfully!", user: { username } });
	} catch (error) {
		console.error("Create User Error:", error);
		res.status(500).json({ message: "Internal Server Error" });
	}
});

app.post("/login", async (req, res) => {
	try {
		const { username, Password } = req.body;

		if (!username || !Password) {
			return res.status(400).json({ message: "All fields are required!" });
		}

		const user = await UserModel.findOne({ username });
		if (!user) {
			return res.status(401).json({ message: "Invalid username or password!" });
		}

		const isMatch = await bcrypt.compare(Password, user.Password);
		if (!isMatch) {
			return res.status(401).json({ message: "Invalid username or password!" });
		}

		const token = jwt.sign(
			{ userId: user._id, username: user.username },
			JWT_SECRET,
			{ expiresIn: "1d" },
		);

		res.status(200).json({
			message: "Login successful!",
			token,
			user: { username: user.username },
		});
	} catch (error) {
		console.error("Login Error:", error);
		res.status(500).json({ message: "Internal Server Error" });
	}
});
app.get("/profile", authenticateToken, async (req, res) => {
	try {
		const user = await UserModel.findById(req.user.userId).select(
			"username profile",
		);

		if (!user) {
			return res.status(404).json({ message: "User not found!" });
		}

		res.status(200).json({
			message: "Profile fetched successfully!",
			user: {
				username: user.username,
				profile: user.profile,
			},
		});
	} catch (error) {
		console.error("Fetch Profile Error:", error);
		res.status(500).json({ message: "Internal Server Error" });
	}
});
module.exports = app;
