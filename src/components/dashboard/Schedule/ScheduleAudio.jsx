import {
  CalendarClock,
  Clock,
  FileAudio,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { useState } from "react";

export default function ScheduleAudio() {
  const [showForm, setShowForm] = useState(false);

  const [schedules, setSchedules] = useState([
    {
      id: 1,
      audio: "Promo Ramadhan.mp3",
      date: "2026-08-08",
      time: "19:00",
      target: "Semua Outlet",
      status: "scheduled",
    },
    {
      id: 2,
      audio: "Pengumuman Jumat.mp3",
      date: "2026-08-14",
      time: "11:30",
      target: "5 Outlet",
      status: "scheduled",
    },
  ]);

  const [form, setForm] = useState({
    audio: "",
    date: "",
    time: "",
    target: "Semua Outlet",
  });

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (
      !form.audio ||
      !form.date ||
      !form.time
    ) {
      return;
    }

    const newSchedule = {
      id: Date.now(),
      ...form,
      status: "scheduled",
    };

    setSchedules((previous) => [
      ...previous,
      newSchedule,
    ]);

    setForm({
      audio: "",
      date: "",
      time: "",
      target: "Semua Outlet",
    });

    setShowForm(false);
  }

  function handleDelete(id) {
    setSchedules((previous) =>
      previous.filter(
        (schedule) => schedule.id !== id
      )
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">

        <div>
          <h2 className="text-base font-semibold text-white">
            Jadwalkan Audio
          </h2>

          <p className="mt-1 text-xs text-neutral-500">
            Atur audio agar diputar otomatis pada waktu tertentu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="
            flex items-center gap-2
            rounded-lg
            bg-gradient-to-b
            from-orange-500
            to-orange-700
            px-4 py-2
            text-sm font-semibold
            text-white
            shadow-lg shadow-orange-900/20
            transition
            hover:brightness-110
            active:scale-[0.98]
          "
        >
          <Plus size={16} />

          Jadwalkan Audio
        </button>

      </div>

      {/* =====================================================
          CONTENT
      ===================================================== */}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">

        {schedules.length === 0 ? (

          <EmptySchedule
            onAdd={() => setShowForm(true)}
          />

        ) : (

          <div className="mx-auto w-full max-w-4xl">

            <div className="mb-4 flex items-center justify-between">

              <p className="text-xs text-neutral-500">
                {schedules.length} jadwal
              </p>

            </div>

            <div className="space-y-2">

              {schedules.map((schedule) => (

                <ScheduleItem
                  key={schedule.id}
                  schedule={schedule}
                  onDelete={handleDelete}
                />

              ))}

            </div>

          </div>

        )}

      </div>

      {/* =====================================================
          MODAL
      ===================================================== */}

      {showForm && (
        <ScheduleModal
          form={form}
          onChange={handleChange}
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
        />
      )}

    </div>
  );
}

function ScheduleItem({
  schedule,
  onDelete,
}) {
  return (
    <div
      className="
        flex items-center gap-4
        rounded-xl
        border border-neutral-800
        bg-neutral-900
        px-4 py-3
        transition
        hover:border-neutral-700
      "
    >

      {/* Icon */}
      <div
        className="
          flex h-10 w-10 flex-shrink-0
          items-center justify-center
          rounded-lg
          bg-orange-500/10
        "
      >
        <FileAudio
          size={19}
          className="text-orange-500"
        />
      </div>

      {/* Audio */}
      <div className="min-w-0 flex-1">

        <p className="truncate text-sm font-medium text-neutral-200">
          {schedule.audio}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-3">

          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <CalendarClock size={12} />

            {schedule.date}
          </span>

          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <Clock size={12} />

            {schedule.time}
          </span>

          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <MapPin size={12} />

            {schedule.target}
          </span>

        </div>

      </div>

      {/* Status */}
      <span
        className="
          hidden flex-shrink-0
          rounded-full
          bg-green-500/10
          px-2.5 py-1
          text-[10px]
          font-semibold
          text-green-400
          sm:block
        "
      >
        Terjadwal
      </span>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(schedule.id)}
        className="
          flex h-8 w-8
          flex-shrink-0
          items-center justify-center
          rounded-lg
          text-neutral-600
          transition
          hover:bg-red-500/10
          hover:text-red-400
        "
      >
        <Trash2 size={15} />
      </button>

    </div>
  );
}

function EmptySchedule({
  onAdd,
}) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center">

      <div className="flex flex-col items-center text-center">

        <div
          className="
            mb-4 flex h-16 w-16
            items-center justify-center
            rounded-full
            bg-orange-500/10
          "
        >
          <CalendarClock
            size={28}
            className="text-orange-500"
          />
        </div>

        <h3 className="text-sm font-semibold text-neutral-200">
          Belum ada jadwal
        </h3>

        <p className="mt-1 max-w-sm text-xs text-neutral-500">
          Buat jadwal audio agar sistem dapat
          menyiarkan audio secara otomatis.
        </p>

        <button
          type="button"
          onClick={onAdd}
          className="
            mt-5 flex items-center gap-2
            rounded-lg
            border border-neutral-700
            bg-neutral-900
            px-4 py-2
            text-xs font-semibold
            text-neutral-300
            transition
            hover:border-orange-500
            hover:text-orange-500
          "
        >
          <Plus size={15} />

          Jadwalkan Audio
        </button>

      </div>

    </div>
  );
}

function ScheduleModal({
  form,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <div
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        bg-black/70
        px-4
      "
    >

      <div
        className="
          w-full max-w-md
          rounded-2xl
          border border-neutral-800
          bg-neutral-900
          shadow-2xl
        "
      >

        {/* Header */}
        <div
          className="
            flex items-center justify-between
            border-b border-neutral-800
            px-5 py-4
          "
        >

          <div>
            <h3 className="text-sm font-semibold text-white">
              Jadwalkan Audio
            </h3>

            <p className="mt-1 text-xs text-neutral-500">
              Tentukan waktu pemutaran audio.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="
              flex h-8 w-8
              items-center justify-center
              rounded-lg
              text-neutral-500
              hover:bg-neutral-800
              hover:text-white
            "
          >
            <X size={17} />
          </button>

        </div>

        {/* Form */}
        <form
          onSubmit={onSubmit}
          className="space-y-5 p-5"
        >

          {/* Audio */}
          <div>

            <label className="mb-2 block text-xs font-medium text-neutral-400">
              Audio
            </label>

            <select
              name="audio"
              value={form.audio}
              onChange={onChange}
              className="
                w-full rounded-lg
                border border-neutral-700
                bg-neutral-800
                px-3 py-2.5
                text-sm text-neutral-200
                outline-none
                focus:border-orange-500
              "
            >
              <option value="">
                Pilih audio
              </option>

              <option value="Promo Ramadhan.mp3">
                Promo Ramadhan.mp3
              </option>

              <option value="Pengumuman Jumat.mp3">
                Pengumuman Jumat.mp3
              </option>
            </select>

          </div>

          {/* Date */}
          <div>

            <label className="mb-2 block text-xs font-medium text-neutral-400">
              Tanggal
            </label>

            <input
              type="date"
              name="date"
              value={form.date}
              onChange={onChange}
              className="
                w-full rounded-lg
                border border-neutral-700
                bg-neutral-800
                px-3 py-2.5
                text-sm text-neutral-200
                outline-none
                focus:border-orange-500
              "
            />

          </div>

          {/* Time */}
          <div>

            <label className="mb-2 block text-xs font-medium text-neutral-400">
              Waktu
            </label>

            <input
              type="time"
              name="time"
              value={form.time}
              onChange={onChange}
              className="
                w-full rounded-lg
                border border-neutral-700
                bg-neutral-800
                px-3 py-2.5
                text-sm text-neutral-200
                outline-none
                focus:border-orange-500
              "
            />

          </div>

          {/* Target */}
          <div>

            <label className="mb-2 block text-xs font-medium text-neutral-400">
              Target Outlet
            </label>

            <select
              name="target"
              value={form.target}
              onChange={onChange}
              className="
                w-full rounded-lg
                border border-neutral-700
                bg-neutral-800
                px-3 py-2.5
                text-sm text-neutral-200
                outline-none
                focus:border-orange-500
              "
            >
              <option value="Semua Outlet">
                Semua Outlet
              </option>

              <option value="Outlet Terpilih">
                Outlet Terpilih
              </option>
            </select>

          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-2">

            <button
              type="button"
              onClick={onClose}
              className="
                rounded-lg
                border border-neutral-700
                px-4 py-2.5
                text-xs font-semibold
                text-neutral-400
                transition
                hover:bg-neutral-800
                hover:text-white
              "
            >
              Batal
            </button>

            <button
              type="submit"
              className="
                rounded-lg
                bg-gradient-to-b
                from-orange-500
                to-orange-700
                px-4 py-2.5
                text-xs font-semibold
                text-white
                transition
                hover:brightness-110
              "
            >
              Simpan Jadwal
            </button>

          </div>

        </form>

      </div>

    </div>
  );
}