const cron = require("node-cron");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// MongoDB Connection
// ======================
mongoose.connect("mongodb://127.0.0.1:27017/smartshelf");

mongoose.connection.once("open", () => {
  console.log("MongoDB Connected");
});

// ======================
// Schemas
// ======================
const StudentSchema = new mongoose.Schema({
  name: String,
  username: String,
  password: String,
  email: String,
  phone: String,
  age: Number
});

const BookSchema = new mongoose.Schema({
  title: String,
  author: String,
  bookId: String,
  status: {
    type: String,
    default: "available"
  }
});

const IssueSchema = new mongoose.Schema({
  studentName: String,
  studentEmail: String,
  bookId: String,
  title: String,
  issueDate: Date,
  dueDate: Date,
  returned: {
    type: Boolean,
    default: false
  },
  fine: {
    type: Number,
    default: 0
  }
});

const Student = mongoose.model("students", StudentSchema);
const Book = mongoose.model("books", BookSchema);
const Issue = mongoose.model("issues", IssueSchema);

// ======================
// EMAIL SETUP
// ======================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "arihantsingh200529@gmail.com",
    pass: "lxotlegmsqgrbvvw"
  }
});

// ======================
// Admin Login
// ======================
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "Admin@2005" && password === "admin123") {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// ======================
// Student Register
// ======================
app.post("/student/register", async (req, res) => {
  await Student.create(req.body);
  res.json({ success: true });
});

// ======================
// Student Login
// ======================
app.post("/student/login", async (req, res) => {
  const { username, password } = req.body;

  const student = await Student.findOne({ username, password });

  if (student) {
    res.json({ success: true, student });
  } else {
    res.json({ success: false });
  }
});

// ======================
// Add Book
// ======================
app.post("/books/add", async (req, res) => {
  await Book.create(req.body);
  res.json({ success: true });
});

// ======================
// Delete Book
// ======================
app.post("/books/delete", async (req, res) => {
  const { bookId } = req.body;
  await Book.deleteOne({ bookId });
  res.json({ success: true });
});

// ======================
// Get Books
// ======================
app.get("/books", async (req, res) => {
  const books = await Book.find();
  res.json(books);
});

// ======================
// ISSUE BOOK (FIXED)
// ======================
app.post("/books/issue", async (req, res) => {
  try {
    const { studentEmail, bookId } = req.body;

    if (!studentEmail || !bookId) {
      return res.json({
        success: false,
        message: "Missing studentEmail or bookId"
      });
    }

    const cleanId = (bookId || "").trim();

    const activeBooks = await Issue.countDocuments({
      studentEmail,
      returned: false
    });

    if (activeBooks >= 3) {
      return res.json({
        success: false,
        message: "Limit reached (Max 3 books)"
      });
    }

    const student = await Student.findOne({ email: studentEmail });
    const book = await Book.findOne({ bookId: cleanId });

    if (!student || !book) {
      return res.json({
        success: false,
        message: "Invalid student or book"
      });
    }

    if (book.status === "issued") {
      return res.json({
        success: false,
        message: "Book already issued"
      });
    }

    const newIssue = new Issue({
      studentName: student.name,
      studentEmail,
      title: book.title,
      bookId: cleanId,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      returned: false,
      fine: 0
    });

    await newIssue.save();

    await Book.updateOne(
      { bookId: cleanId },
      { $set: { status: "issued" } }
    );

    res.json({ success: true });

  } catch (err) {
    console.log("ISSUE ERROR:", err); // 🔥 helpful debug
    res.json({ success: false, message: "Server error" });
  }
});

// ======================
// RETURN BOOK (ONLY ONE)
// ======================
app.post("/books/return", async (req, res) => {
  try {
    const { issueId } = req.body;

    const issue = await Issue.findById(issueId);

    if (!issue) return res.json({ success: false });

    const today = new Date();
    const due = new Date(issue.dueDate);

    let fine = 0;

    if (today > due) {
      const days = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
      fine = days * 100;
    }

    issue.returned = true;
    issue.fine = fine;
    await issue.save();

    await Book.updateOne(
      { bookId: issue.bookId },
      { status: "available" }
    );

    // 📧 EMAIL
    await transporter.sendMail({
      to: issue.studentEmail,
      subject: "Book Returned",
      text: `Book returned successfully.\nFine: ₹${fine}`
    });

    res.json({ success: true, fine });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// ======================
// GET ISSUES
// ======================
app.get("/issues", async (req, res) => {
  const data = await Issue.find();
  res.json(data);
});

// ======================
// MY BOOKS
// ======================
app.get("/my-books/:email", async (req, res) => {
  const books = await Issue.find({
    studentEmail: req.params.email
  });
  res.json(books);
});

// ======================
// RECOMMEND
// ======================
app.get("/recommend/:email", async (req, res) => {
  const userBooks = await Issue.find({ studentEmail: req.params.email });

  if (userBooks.length === 0) return res.json([]);

  const titles = userBooks.map(b => b.title);

  const recommended = await Book.find({
    title: { $regex: titles.join("|"), $options: "i" }
  });

  res.json(recommended);
});

// ======================
// WARNING EMAIL (FIXED)
// ======================
app.post("/send-warning", async (req, res) => {
  try {
    await transporter.sendMail({
      to: req.body.studentEmail,
      subject: "⚠ Library Warning",
      text: `Please return book "${req.body.title}" immediately.`
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// ======================
// AUTO CRON (UNCHANGED)
// ======================
cron.schedule("0 0 * * *", async () => {
  const issues = await Issue.find({ returned: false });

  const today = new Date();

  for (let issue of issues) {
    const due = new Date(issue.dueDate);
    const diffDays = Math.ceil((today - due) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      await transporter.sendMail({
        to: issue.studentEmail,
        subject: "Reminder",
        text: `Your book "${issue.title}" is due today.`
      });
    }

    if (diffDays > 0) {
      const fine = diffDays * 100;

      await Issue.updateOne(
        { _id: issue._id },
        { fine }
      );

      await transporter.sendMail({
        to: issue.studentEmail,
        subject: "Fine Applied",
        text: `Fine: ₹${fine}`
      });
    }
  }
});

// ======================
app.listen(5000, () => {
  console.log("Server running on port 5000");
});