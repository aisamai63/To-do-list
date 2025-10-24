// Import dependencies
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

// Keep the process alive for development: log unhandled rejections/uncaught exceptions
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
  // Don't exit here; the app has an in-memory fallback for DB failures.
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // For development, log and continue. In production you might want to restart.
});

// ✅ Connect to MongoDB (use MONGODB_URI from environment or fallback to local)
const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/todo-app";

// Reduce strictQuery warnings on newer Mongoose versions
mongoose.set("strictQuery", false);

// Use an async connect function so we can await and handle errors cleanly.
// Provide recommended options for compatibility (harmless on modern Mongoose).
async function connectToMongo() {
  const maxRetries = 3;
  let attempt = 0;
  const baseDelay = 1000; // 1s

  while (attempt <= maxRetries) {
    try {
      attempt++;
      await mongoose.connect(mongoUri, {
        // serverSelectionTimeoutMS keeps connection attempts from hanging too long
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`✅ Connected to MongoDB at ${mongoUri}`);
      return;
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error(
        `❌ MongoDB connection attempt ${attempt} failed:`,
        message
      );
      if (attempt > maxRetries) {
        console.warn(
          "⚠️  Max MongoDB connection attempts reached. Continuing in-memory fallback mode. To enable MongoDB, start a MongoDB instance or set MONGODB_URI in a .env file."
        );
        break;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying MongoDB connection in ${delay}ms...`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

// Start the connection attempt (non-blocking for the rest of the server startup)
connectToMongo();

// Simple CORS middleware to allow frontend dev server access (kept for compatibility)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// In-memory fallback store when MongoDB isn't available
const inMemoryTasks = [];
let inMemoryIdCounter = 1;
const isDbConnected = () =>
  mongoose.connection && mongoose.connection.readyState === 1;

// ✅ Define Task Schema and Model
const taskSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  dueDate: { type: Date },

  // NEW: draggable card position (optional)
  position: {
    x: { type: Number, default: null },
    y: { type: Number, default: null },
  },
});

// auto-update updatedAt on save
taskSchema.pre("save", function (next) {
  if (this.isModified()) this.updatedAt = new Date();
  next();
});

const Task = mongoose.model("Task", taskSchema);

// ✅ Routes

// 🏠 Root route / health
app.get("/", (req, res) => {
  res.send("Welcome to the To-Do App Backend!");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongo: isDbConnected(),
    time: new Date().toISOString(),
  });
});

// 🟢 GET all tasks
app.get("/tasks", async (req, res) => {
  try {
    if (isDbConnected()) {
      const tasks = await Task.find().sort({ completed: 1, dueDate: 1 }); // incomplete first
      return res.json(tasks);
    }
    // sort in-memory same way
    const sorted = [...inMemoryTasks].sort((a, b) => {
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });
    return res.json(sorted);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 GET a single task by ID
app.get("/tasks/:id", async (req, res) => {
  try {
    if (isDbConnected()) {
      const task = await Task.findById(req.params.id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      return res.json(task);
    }
    const task = inMemoryTasks.find((t) => t._id === req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟡 POST (add) a new task
app.post("/tasks", async (req, res) => {
  try {
    const { text, dueDate, position } = req.body; // 👈 accept position
    // log incoming body for debugging add failures
    console.log("POST /tasks body:", JSON.stringify(req.body));
    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "Task text is required." });
    }

    if (isDbConnected()) {
      const newTask = new Task({
        text: String(text).trim(),
        dueDate: dueDate ? new Date(dueDate) : null,
        position: position ?? null, // 👈 store position if provided
      });
      await newTask.save();
      return res.status(201).json(newTask);
    }

    // Fallback for in-memory
    const newTask = {
      _id: String(Date.now()) + "-" + inMemoryIdCounter++,
      text: String(text).trim(),
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      position: position ?? null, // 👈 keep position in memory too
    };
    inMemoryTasks.push(newTask);
    return res.status(201).json(newTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// 🟠 PUT (update) a task by ID
app.put("/tasks/:id", async (req, res) => {
  try {
    const payload = { ...req.body };
    // set updatedAt on updates
    payload.updatedAt = new Date();

    if (isDbConnected()) {
      const task = await Task.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
      });
      if (!task) return res.status(404).json({ message: "Task not found" });
      return res.json(task);
    }

    const idx = inMemoryTasks.findIndex((t) => t._id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: "Task not found" });
    inMemoryTasks[idx] = { ...inMemoryTasks[idx], ...payload };
    res.json(inMemoryTasks[idx]);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// 🔴 DELETE a task by ID
app.delete("/tasks/:id", async (req, res) => {
  try {
    if (isDbConnected()) {
      const task = await Task.findByIdAndDelete(req.params.id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      return res.json({ message: "Task deleted successfully" });
    }
    const idx = inMemoryTasks.findIndex((t) => t._id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: "Task not found" });
    inMemoryTasks.splice(idx, 1);
    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🚀 Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
