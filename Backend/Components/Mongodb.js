const mongoose = require("mongoose");

async function connectDB() {
    try {
        await mongoose.connect(
            "mongodb+srv://yashsinghprogramer_db_user:yash%40123@wisper.dlmdtx6.mongodb.net/wisper?authSource=admin"
        );
        console.log("Connected to Data Base successfully!");

        await createTestUser();
        
    } catch (error) {
        console.error("Database connection error:", error);
    }
}

// 2. Schema Definition
const wisperuserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    Password: { type: String, required: true },
	profile:{type: String, required:true}
});

// 3. Model Creation
const UserModel = mongoose.model("user", wisperuserSchema);

// Test Function: Pehla data insert karne ke liye
async function createTestUser() {
    try {
        const userCount = await UserModel.countDocuments();
        if (userCount === 0) {
            const testUser = new UserModel({
                username: "testuser",
                Password: "password123",
				profile:"https://i.pinimg.com/736x/79/06/3c/79063cde98330c094611628cf7a16e4f.jpg"
            });
            await testUser.save();
            console.log("Schema generated and test user created successfully!");
        }
    } catch (err) {
        console.log("Error creating test user:", err);
    }
}

// Run the connection
connectDB();

module.exports = UserModel;
