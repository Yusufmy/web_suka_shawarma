import { useState } from "react";

export default function PasswordField({ value, onChange }) {
    const [isReadOnly, setIsReadOnly] = useState(true);

    return (
        <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
                Kata Sandi
            </label>

            <div className="flex items-center gap-2.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3.5 py-2.5 focus-within:border-orange-500">
                <span className="flex-shrink-0 text-neutral-500">
                    🔒
                </span>

                <input
                    type="password"
                    name="operator_access_password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    readOnly={isReadOnly}
                    value={value}
                    onFocus={() => setIsReadOnly(false)}
                    onChange={onChange}
                    className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-600 outline-none"
                />
            </div>
        </div>
    );
}