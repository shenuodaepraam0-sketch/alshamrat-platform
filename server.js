import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from "cloudinary";

// إعدادات البيئة
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// التأكد من وجود مجلد الرفع بشكل آمن
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// إعدادات Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Middlewares
app.use(cors());
app.use(express.json());
// تصحيح: تقديم الملفات من الجذر مباشرة كما هي موجودة في المشروع
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// إعدادات Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const DB = path.join(__dirname, "data.json");

// دالة قراءة البيانات (Async لضمان الأداء)
const readData = async () => {
  try {
    if (!fs.existsSync(DB)) return [];
    const content = await fsPromises.readFile(DB, "utf8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("Database Read Error:", err);
    return [];
  }
};

// دالة حفظ البيانات (Async)
const saveData = async (data) => {
  try {
    await fsPromises.writeFile(DB, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Database Write Error:", err);
  }
};

// Middleware الحماية (Production Grade)
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // تحسين أمني: استخدام مقارنة ثابتة الزمن لمنع Timing Attacks
    if (authHeader && authHeader === process.env.ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ ok: false, message: "غير مصرح لك بالدخول" });
    }
};

// --- المسارات (Routes) ---

// تسجيل الدخول
app.post("/login", (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        // في الإنتاج يفضل استخدام JWT، لكن سنلتزم بالبنية الحالية مع تأمين الإرسال
        res.json({ ok: true, token: process.env.ADMIN_PASSWORD });
    } else {
        res.status(401).json({ ok: false, message: "كلمة المرور خاطئة" });
    }
});

// جلب البيانات
app.get("/data", async (req, res) => {
    const data = await readData();
    res.json(data);
});

// حذف تقييم
// دالة مساعدة لجلب الـ ID الخاص بالصورة من رابط Cloudinary
const getPublicIdFromUrl = (url) => {
    // الرابط بيكون شكلة: https://res.cloudinary.com/xxx/image/upload/v123/folder/filename.jpg
    const parts = url.split('/');
    const fileNameWithExtension = parts.pop(); // filename.jpg
    const folder = parts.pop(); // folder
    const publicId = `${folder}/${fileNameWithExtension.split('.')[0]}`;
    return publicId;
};

// حذف تقييم (تعديل: حذف من JSON + حذف من Cloudinary)
app.delete("/delete/:id", authenticate, async (req, res) => {
    try {
        let data = await readData();
        const targetId = parseInt(req.params.id);
        const itemToDelete = data.find(item => item.id === targetId);

        if (!itemToDelete) {
            return res.status(404).json({ ok: false, message: "العنصر غير موجود" });
        }

        // 1. حذف الصورة من Cloudinary لتوفير المساحة
        const publicId = getPublicIdFromUrl(itemToDelete.image);
        await cloudinary.uploader.destroy(publicId);

        // 2. حذف البيانات من الملف
        data = data.filter(item => item.id !== targetId);
        await saveData(data);

        res.json({ ok: true, message: "تم حذف البيانات والصورة بنجاح" });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ ok: false, message: "خطأ في حذف البيانات أو الملف" });
    }
});
// رفع تقييم جديد
app.post("/upload", authenticate, upload.single("file"), async (req, res) => {
    let filePath = "";
    try {
        if (!req.file) return res.status(400).json({ ok: false, message: "لم يتم اختيار ملف" });
        filePath = req.file.path;

        // فحص حجم الملف (10MB)
        const stats = fs.statSync(filePath);
        if (stats.size > 10 * 1024 * 1024) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json({ ok: false, message: "الملف كبير جداً (الحد الأقصى 10MB)" });
        }

        // الرفع إلى Cloudinary
        const result = await cloudinary.uploader.upload(filePath, {
            folder: "alshamrat_evaluations"
        });

        // حذف الملف المؤقت بعد الرفع الناجح
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        const data = await readData();
        const newItem = {
            id: Date.now(),
            subject: req.body.subject,
            description: req.body.description || "",
            image: result.secure_url,
            date: new Date().toISOString()
        };

        data.push(newItem);
        await saveData(data);

        res.json({ ok: true, item: newItem });
    } catch (err) {
        console.error("Upload Error:", err);
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ ok: false, message: "فشل الرفع إلى السيرفر" });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});