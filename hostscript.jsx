// دالة مساعدة لتحويل Hex إلى RGB للبريمير
function hexToRgb(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b, 255];
}

function generateCaptionsOnTimeline(dataStr) {
    try {
        var data = JSON.parse(dataStr);
        var chunks = data.chunks;
        var settings = data.settings;

        var seq = app.project.activeSequence;
        if (!seq) return "Error: لا يوجد تايملاين نشط!";

        var templateItem = null;
        var destTrack = null;

        // 1. البحث عن الطبقة التي قام المستخدم بتحديدها لتكون القالب
        for (var i = 0; i < seq.videoTracks.numTracks; i++) {
            var track = seq.videoTracks[i];
            for (var j = 0; j < track.clips.numItems; j++) {
                if (track.clips[j].isSelected()) {
                    templateItem = track.clips[j];
                    break;
                }
            }
            if (templateItem) break;
        }

        if (!templateItem) {
            return "Error: يرجى إنشاء طبقة نص (Text Layer) وضبط اللغة، ثم تحديدها (Select) لتكون القالب.";
        }

        var projItem = templateItem.projectItem;
        
        // استخدام أعلى تراك متاح لوضع الترجمة عليه
        var trackIndex = seq.videoTracks.numTracks - 1;
        destTrack = seq.videoTracks[trackIndex];

        // تفعيل الـ QE DOM (للأمان)
        app.enableQE();

        for (var c = 0; c < chunks.length; c++) {
            var chunk = chunks[c];
            
            // ضبط توقيت البداية والنهاية
            var startTime = new Time();
            startTime.seconds = chunk.start;
            var endTime = new Time();
            endTime.seconds = chunk.end;

            // 2. نسخ الطبقة الأساسية للتوقيت الجديد (Overwrite لمنع تحريك باقي الفيديو)
            var newClip = destTrack.overwriteClip(projItem, startTime);

            if (newClip) {
                // ضبط نهاية المقطع
                newClip.end = endTime;

                // 3. تعديل النص الداخلي
                var mgt = newClip.getMGTComponent();
                if (mgt) {
                    // البحث عن خاصية النص (تختلف التسمية حسب لغة البريمير)
                    var textParam = mgt.properties.getParamForDisplayName("Source Text") || 
                                    mgt.properties.getParamForDisplayName("Text") || 
                                    mgt.properties.getParamForDisplayName("النص المصدر");
                                    
                    if (textParam) {
                        var tObj = JSON.parse(textParam.getValue());
                        tObj.textEditValue = chunk.text;
                        tObj.fontSize = parseFloat(settings.fontSize);
                        tObj.fillColor = hexToRgb(settings.textColor);
                        
                        textParam.setValue(JSON.stringify(tObj));
                    }
                }

                // 4. تطبيق الـ الأنيميشن (Keyframes) للـ Motion و Opacity
                var motionComp = null;
                var opacityComp = null;

                for(var compIdx=0; compIdx < newClip.components.numItems; compIdx++){
                    var cmp = newClip.components[compIdx];
                    if(cmp.matchName === "AE.ADBE Motion") motionComp = cmp;
                    if(cmp.matchName === "AE.ADBE Opacity") opacityComp = cmp;
                }

                // إضافة أنيميشن الظهور (Scale Pop) وتغيير الموقع (Y Pos)
                if (motionComp) {
                    var posProp = motionComp.properties.getParamForDisplayName("Position") || motionComp.properties.getParamForDisplayName("الموضع");
                    if(posProp) {
                        // Position in PPro uses Normalized [0..1] range usually
                        posProp.setValue([0.5, parseFloat(settings.posY) / 100]);
                    }

                    var scaleProp = motionComp.properties.getParamForDisplayName("Scale") || motionComp.properties.getParamForDisplayName("مقياس");
                    if(scaleProp) {
                        scaleProp.setTimeVarying(true);
                        
                        scaleProp.addKey(startTime);
                        scaleProp.setValueAtKey(startTime, 40); // بداية الـ Pop

                        var popTime = new Time();
                        popTime.seconds = chunk.start + 0.15; // بعد 4 فريمات تقريباً
                        scaleProp.addKey(popTime);
                        scaleProp.setValueAtKey(popTime, 100);
                    }
                }

                // إضافة تأثير الشفافية (Opacity Fade in)
                if (opacityComp) {
                    var opProp = opacityComp.properties.getParamForDisplayName("Opacity") || opacityComp.properties.getParamForDisplayName("تعتيم");
                    if (opProp) {
                        opProp.setTimeVarying(true);
                        
                        opProp.addKey(startTime);
                        opProp.setValueAtKey(startTime, 0);

                        var fadeTime = new Time();
                        fadeTime.seconds = chunk.start + 0.15;
                        opProp.addKey(fadeTime);
                        opProp.setValueAtKey(fadeTime, 100);
                    }
                }
            }
        }
        return "Success";
    } catch(err) {
        return "Error: " + err.toString();
    }
}
