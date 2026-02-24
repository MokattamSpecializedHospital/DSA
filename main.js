// تحويل الثواني من صيغة SRT إلى ثواني رقمية
function timeToSeconds(timeStr) {
    const parts = timeStr.replace(',', '.').split(':');
    if(parts.length !== 3) return 0;
    return (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parseFloat(parts[2]));
}

// تحليل ملف SRT و VTT
function parseSubtitle(content) {
    const blocks = content.trim().split(/\r?\n\r?\n/);
    let wordsArray = [];
    
    blocks.forEach(block => {
        const lines = block.split(/\r?\n/);
        let timeLine = lines.find(l => l.includes('-->'));
        if (!timeLine) return;
        
        const [startStr, endStr] = timeLine.split('-->');
        const startSec = timeToSeconds(startStr.trim());
        const endSec = timeToSeconds(endStr.trim());
        
        const textContent = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
        const words = textContent.split(/\s+/).filter(w => w !== "");
        
        const duration = Math.max(endSec - startSec, 0.1);
        const timePerWord = duration / Math.max(words.length, 1);
        
        words.forEach((w, i) => {
            wordsArray.push({
                text: w.replace(/\*/g, ''), // إزالة النجوم إذا وجدت
                start: startSec + (i * timePerWord),
                end: startSec + ((i + 1) * timePerWord)
            });
        });
    });
    return wordsArray;
}

// إعادة تجميع الكلمات بناءً على العدد المطلوب بالشاشة
function performChunking(wordsArray, limit) {
    const chunks = [];
    let temp = [];
    for (let i = 0; i < wordsArray.length; i++) {
        temp.push(wordsArray[i]);
        const nextWordGap = i < wordsArray.length - 1 ? (wordsArray[i+1].start - wordsArray[i].end) : 0;
        
        if (temp.length >= limit || nextWordGap > 0.4 || i === wordsArray.length - 1) {
            chunks.push({
                start: temp[0].start,
                end: temp[temp.length - 1].end,
                text: temp.map(w => w.text).join(' ')
            });
            temp = [];
        }
    }
    return chunks;
}

let loadedContent = "";

document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('fileLabel').innerText = "✅ " + file.name;
    
    const reader = new FileReader();
    reader.onload = (evt) => { loadedContent = evt.target.result; };
    reader.readAsText(file);
});

document.getElementById('generateBtn').addEventListener('click', function() {
    const statusEl = document.getElementById('status');
    
    if (!loadedContent) {
        statusEl.style.color = '#ff4d4d';
        statusEl.innerText = "الرجاء اختيار ملف SRT أولاً!";
        return;
    }

    statusEl.style.color = '#2d8ceb';
    statusEl.innerText = "جاري المعالجة...";

    // 1. جمع الإعدادات
    const settings = {
        textColor: document.getElementById('textColor').value,
        fontSize: document.getElementById('fontSize').value,
        posY: document.getElementById('posY').value,
    };
    
    const chunkSize = parseInt(document.getElementById('chunkSize').value) || 3;

    // 2. تحليل وتقطيع الكابشن
    const rawWords = parseSubtitle(loadedContent);
    const chunks = performChunking(rawWords, chunkSize);

    // 3. تغليف البيانات كـ JSON لإرسالها لـ Premiere
    const payload = JSON.stringify({
        chunks: chunks,
        settings: settings
    });

    // 4. إرسال الأوامر لـ ExtendScript
    // نستخدم window.__adobe_cep__ مباشرة بدلاً من تحميل مكتبة CSInterface بالكامل
    if (window.__adobe_cep__) {
        // الهروب من الرموز الخاصة في JSON ليمر بأمان في دالة Eval
        const escapedPayload = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `generateCaptionsOnTimeline("${escapedPayload}")`;
        
        window.__adobe_cep__.evalScript(script, function(result) {
            if (result === "Success") {
                statusEl.style.color = '#4ade80';
                statusEl.innerText = "✅ تم إضافة الكابشن للتايملاين بنجاح!";
            } else {
                statusEl.style.color = '#ff4d4d';
                statusEl.innerText = result; // سيظهر رسالة الخطأ من البريمير
            }
        });
    } else {
        statusEl.style.color = '#ff4d4d';
        statusEl.innerText = "هذا الزر يعمل فقط داخل Premiere Pro!";
    }
});
