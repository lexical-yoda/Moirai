import { ThemePicker } from "@/components/layout/theme-picker";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <ThemePicker />
      </div>
      {children}
    </>
  );
}
