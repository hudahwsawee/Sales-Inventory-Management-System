import { useEffect, useRef } from 'react';

const SCAN_CHAR_INTERVAL_MS = 50; // قارئ الباركود يكتب الأحرف بسرعة أعلى بكثير من الكتابة اليدوية
const SCAN_MIN_LENGTH = 3;

/**
 * BarcodeCapture — مكوّن معزول تمامًا (حسب القرار المعتمد: USB/Bluetooth
 * Keyboard Emulation فقط، بلا SDK خاص بجهاز). يعمل بمراقبة تسلسل الإدخال
 * السريع المنتهي بـEnter في أي مكان بالصفحة (وليس حقلًا محددًا)، ليعمل
 * حتى لو لم يكن أي حقل نصي مركَّزًا عليه صراحة.
 *
 * الاستبدال المستقبلي بكاميرا/SDK: يتطلب فقط استبدال هذا المكوّن، دون أي
 * تغيير في منطق شاشة الاستلام التي تستهلك onScan(barcode).
 */
export function BarcodeCapture({ onScan, disabled = false }: { onScan: (barcode: string) => void; disabled?: boolean }) {
  const bufferRef = useRef('');
  const lastCharTimeRef = useRef(0);

  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now();

      // إدخال بطيء (كتابة يدوية) = يُعاد ضبط المخزن المؤقت، لا يُعامَل كمسح باركود
      if (now - lastCharTimeRef.current > SCAN_CHAR_INTERVAL_MS * 5) {
        bufferRef.current = '';
      }
      lastCharTimeRef.current = now;

      if (e.key === 'Enter') {
        const scanned = bufferRef.current.trim();
        bufferRef.current = '';
        if (scanned.length >= SCAN_MIN_LENGTH) {
          onScan(scanned);
        }
        return;
      }

      // تجاهل مفاتيح التحكم (Shift, Tab...) وقصر الالتقاط على الأحرف والأرقام فقط
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan, disabled]);

  // لا يعرض أي عنصر مرئي — مجرد مستمع خلفي، حسب مفهوم BarcodeCapture المعتمد بالمعمارية
  return null;
}
