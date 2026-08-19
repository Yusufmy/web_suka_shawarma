export default function AuthBrand() {
  return (
    <div className="mb-8 flex flex-col items-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-lg font-bold text-white shadow-lg shadow-orange-900/40">
        AS
      </div>

      <div>
        <h1 className="text-lg font-bold text-white">
          Audio <span className="text-orange-500">Suka Shawarma</span>
        </h1>

        <p className="mt-1 text-xs text-neutral-500">
          Masuk sebagai Operator untuk mengelola siaran
        </p>
      </div>
    </div>
  );
}