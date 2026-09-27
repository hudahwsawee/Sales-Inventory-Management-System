/**
 * SimpleBarChart — مخطط أعمدة بسيط بلا أي مكتبة خارجية (SVG/CSS فقط).
 *
 * قرار تقني موثَّق: لم تكن هناك أي مكتبة رسوم بيانية مثبَّتة أصلًا في هذا
 * المشروع (package.json الحالي لا يحتوي recharts/chart.js/إلخ)، وإضافة
 * مكتبة جديدة الآن تعني تبعية لا يمكن التحقق فعليًا من تثبيتها وعملها في
 * بيئة التطوير الحالية دون تشغيل npm install حقيقي. بدلًا من المخاطرة
 * بتبعية غير مُختبَرة، بُني هذا المكوّن الخفيف (SVG بسيط) ليغطي احتياجات
 * Step 7 من الرسوم البيانية (اتجاه/توزيع) بموثوقية كاملة ودون أي تبعية.
 */
export function SimpleBarChart({
  data,
  height = 220,
  valueFormatter = (v: number) => v.toLocaleString('ar-SA'),
}: {
  data: { label: string; value: number }[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">لا توجد بيانات لعرضها</p>;
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1); // تفاديًا للقسمة على صفر إن كانت كل القيم 0

  return (
    <div dir="rtl" className="w-full overflow-x-auto">
      <div className="flex items-end gap-3 min-w-max px-2" style={{ height }}>
        {data.map((d, idx) => {
          const barHeightPercent = Math.max((d.value / maxValue) * 100, 2); // حد أدنى مرئي حتى للقيم الصغيرة جدًا
          return (
            <div key={idx} className="flex flex-col items-center justify-end h-full w-16 shrink-0">
              <span className="text-[10px] text-gray-600 mb-1 whitespace-nowrap">{valueFormatter(d.value)}</span>
              <div
                className="w-8 bg-blue-500 rounded-t transition-all"
                style={{ height: `${barHeightPercent}%`, minHeight: 4 }}
                title={`${d.label}: ${valueFormatter(d.value)}`}
              />
              <span className="text-[10px] text-gray-500 mt-1 text-center break-words w-16">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
