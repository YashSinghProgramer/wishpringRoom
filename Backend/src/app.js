const { createServer } = require("node:http");
const express = require("express");
const cors = require("cors");
const dns = require("dns");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const Groq = require("groq-sdk");
const OpenAI = require("openai");
const { Server } = require("socket.io");
dotenv.config();
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const UserModel = require("../Components/Mongodb");
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
	cors: {
		origin: "http://localhost:3000",
		methods: ["GET", "POST"],
	},
});
const allowedOrigins = [
	"https://whisper-six-pi.vercel.app",
	"http://localhost:3000",
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

const groq = new Groq({
	apiKey: process.env.GROQ_API_KEY,
});

app.post("/api/chat", async (req, res) => {
	try {
		const { message, history } = req.body;

		if (!message) {
			return res.status(400).json({ error: "Message is required" });
		}

		const formattedMessages = [
			{
				role: "system",
				content:
					"You are Wisper AI, the intelligent assistant inside the Wisper platform.Your role is to help users with coding, learning, writing, brainstorming, productivity, and general questions. Be friendly, concise, and helpful.Rules:- Never claim to know a user's real identity. - Respect the anonymous nature of Wisper. - Protect user privacy and never ask for unnecessary personal information. - Give accurate, step-by-step answers when needed.- For coding questions, provide clean, well-explained code. - For writing tasks, create clear and natural content. - If you are unsure, say so instead of making up facts. - Refuse requests that could harm people or facilitate illegal activities. - Keep responses positive, respectful, and easy to understand. Your personality: - Calm - Professional - Supportive - Intelligent - Privacy-first , Always introduce yourself as `Wisper AI` when appropriate and focus on helping users effectively while maintaining a safe and private experience. you can use english and hinglish accoring to user  and if user talk to you that means user friends where not online. and not write paras talk in shot and you talk like a friend like an real human being and talk to him about there day to day life.",
			},
			...(history || []),
			{ role: "user", content: message },
		];

		// Llama 3.1 8B Model (Free)
		const completion = await groq.chat.completions.create({
			messages: formattedMessages,
			model: "llama-3.1-8b-instant",
			temperature: 0.7,
			max_tokens: 1024,
		});

		const aiResponse =
			completion.choices[0]?.message?.content || "No response generated.";

		return res.json({
			success: true,
			reply: aiResponse,
		});
	} catch (error) {
		console.error("Groq Error:", error);
		return res.status(500).json({
			success: false,
			error: "AI response generate karne me error aaya.",
		});
	}
});
const room = "red_room";

io.on("connection", (socket) => {
	console.log("a user connected", socket.id);

	// 1. Join Room Event
	socket.on("joinRoom", (username) => {
		console.log(`${username} joined the group.`);
		socket.join(room);

		// Baaki sabhi users ko notify karo (except sender)
		socket.to(room).emit("notice", username);
	});

	// 2. Chat Message Event (Separated from joinRoom)
	socket.on("chatmessage", (msg) => {
		console.log("Received message:", msg);

		// Room me sabhi log (sender including) ko message bhejo:
		io.to(room).emit("chatmessage", msg);
	});

	socket.on("disconnect", () => {
		console.log("user disconnected", socket.id);
	});
});

module.exports = { app, httpServer };
