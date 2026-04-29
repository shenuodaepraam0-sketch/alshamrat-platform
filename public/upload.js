let authToken = ""; 

// 1. دالة تسجيل الدخول
async function login() {
    const passField = document.getElementById("pass");
    const pass = passField.value;

    if (!pass) {
        Swal.fire("تنبيه", "يرجى إدخال كلمة المرور", "warning");
        return;
    }

    try {
        const res = await axios.post("/login", { password: pass });
        if (res.data.ok) {
            authToken = res.data.token; 
            document.getElementById("login-box").style.display = "none";
            document.getElementById("panel").style.display = "block";
            
            Swal.fire({
                icon: 'success',
                title: 'تم تسجيل الدخول',
                showConfirmButton: false,
                timer: 1500
            });
            
            // تحميل القائمة فور تسجيل الدخول
            loadAdminList();
        }
    } catch (err) {
        Swal.fire("❌", err.response?.data?.message || "كلمة السر خاطئة", "error");
    }
}

// 2. دالة رفع الملفات
async function uploadFile() {
    const fileInput = document.getElementById("file");
    const subjectInput = document.getElementById("subject");
    const descInput = document.getElementById("description");
    const btn = document.getElementById("uploadBtn");

    const file = fileInput.files[0];
    const subject = subjectInput.value.trim(); // استخدام trim لمنع مشاكل المسافات الزائدة
    const description = descInput.value.trim();

    if (!file) {
        Swal.fire("❌", "يرجى اختيار ملف أولاً", "error");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subject", subject);
    formData.append("description", description);

    // تعطيل الزر لمنع الضغط المتكرر
    btn.disabled = true;
    btn.innerText = "جاري الرفع... برجاء الانتظار ⏳";

    try {
        const res = await axios.post("/upload", formData, {
            headers: { 
                "Content-Type": "multipart/form-data",
                "Authorization": authToken 
            }
        });

        if (res.data.ok) {
            Swal.fire("✔", "تم رفع التقييم بنجاح", "success");
            
            // تصفير الحقول بعد النجاح
            fileInput.value = "";
            descInput.value = "";
            
            // تحديث القائمة لإظهار المنشور الجديد
            loadAdminList();
        }
    } catch (err) {
        Swal.fire("❌", err.response?.data?.message || "حدث خطأ أثناء الرفع", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 رفع التقييم الآن";
    }
}

// 3. تحميل قائمة الإدارة (تعرض ما سيتم حذفه مع صورة تعريفية)
async function loadAdminList() {
    const listDiv = document.getElementById("admin-list");
    listDiv.innerHTML = "<p style='text-align:center;'>جاري تحميل القائمة...</p>";
    
    try {
        const res = await axios.get("/data");
        const data = res.data;
        listDiv.innerHTML = "";

        if (data.length === 0) {
            listDiv.innerHTML = "<p style='text-align:center; opacity:0.6;'>لا توجد تقييمات حالياً</p>";
            return;
        }

        // ترتيب التقييمات من الأحدث للأقدم
        data.reverse().forEach(item => {
            const itemEl = document.createElement("div");
            itemEl.style = `
                background: rgba(255,255,255,0.05); 
                padding: 10px; 
                margin-bottom: 10px; 
                border-radius: 10px; 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                text-align: right; 
                border: 1px solid rgba(255,255,255,0.1);
            `;
            
            itemEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${item.image}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 5px; border: 1px solid #00f7ff;">
                    <div>
                        <strong style="color:#00f7ff; font-size: 14px;">${item.subject}</strong><br>
                        <small style="opacity:0.6; font-size: 11px;">${new Date(item.date).toLocaleDateString('ar-EG')}</small>
                    </div>
                </div>
                <button onclick="deleteItem(${item.id}, '${item.subject}')" 
                        style="width:auto; margin:0; padding:6px 12px; background:#ff4b2b; color:white; border:none; border-radius:5px; cursor:pointer; font-size: 12px; font-weight: bold;">
                    حذف 🗑️
                </button>
            `;
            listDiv.appendChild(itemEl);
        });
    } catch (err) {
        console.error("Error loading list:", err);
        listDiv.innerHTML = "<p style='color:red; text-align:center;'>فشل تحميل القائمة</p>";
    }
}

// 4. حذف عنصر (مع تأكيد وحذف من المساحة)
async function deleteItem(id, subjectName) {
    const result = await Swal.fire({
        title: 'تأكيد الحذف النهائي',
        text: `أنت على وشك حذف تقييم (${subjectName}). سيتم مسح الصورة من السيرفر لتوفير المساحة، هل أنت متأكد؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4b2b',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذف الآن',
        cancelButtonText: 'تراجع',
        background: '#1a1a2e',
        color: '#fff'
    });

    if (result.isConfirmed) {
        try {
            // إظهار حالة جاري الحذف
            Swal.fire({ title: 'جاري الحذف وتوفير المساحة...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            const res = await axios.delete(`/delete/${id}`, {
                headers: { "Authorization": authToken }
            });

            if (res.data.ok) {
                Swal.fire({
                    icon: 'success',
                    title: 'تم الحذف!',
                    text: 'تم مسح التقييم والصورة من السيرفر بنجاح.',
                    timer: 1500,
                    showConfirmButton: false
                });
                // تحديث القائمة بعد الحذف
                loadAdminList();
            }
        } catch (err) {
            console.error("Delete error:", err);
            Swal.fire("خطأ", err.response?.data?.message || "فشل عملية الحذف من السيرفر", "error");
        }
    }
}