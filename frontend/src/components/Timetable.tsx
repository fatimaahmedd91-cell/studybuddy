// Weekly free-time grid. Pass "other" to highlight the times you are both free.
import { DAYS, SLOTS, type Student } from "@/lib/data";

export default function Timetable({
  mine,
  other,
  dark = false,
}: {
  mine: Student;
  other?: Student;
  dark?: boolean;
}) {
  const head = dark ? "text-paper" : "text-bark";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] table-fixed border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr>
            <th className="w-20" />
            {DAYS.map((d) => (
              <th key={d} className={`pb-1 font-semibold ${head}`}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((slot) => (
            <tr key={slot}>
              <th className={`pr-1 text-right font-medium capitalize ${head}`}>{slot}</th>
              {DAYS.map((day) => {
                const meFree = (mine.free[day] ?? []).includes(slot);
                const themFree = other ? (other.free[day] ?? []).includes(slot) : false;
                let style = "bg-paper/40 text-bark/50";
                let label = "";
                if (meFree && themFree) {
                  style = "bg-[#1c7c3a] text-white font-semibold";
                  label = "Both free";
                } else if (meFree) {
                  style = "bg-paper text-bark";
                  label = other ? "You" : "Free";
                } else if (themFree) {
                  style = "bg-ice text-bark";
                  label = "Them";
                }
                return (
                  <td key={day} className={`h-10 rounded-lg ${style}`}>
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
