import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
        <h1 className="text-2xl font-bold text-foreground">Luzly</h1>
        <p className="mt-2 text-sm text-muted">
          הגישה מיועדת לאנשי צוות מורשים בלבד.
        </p>
        <div className="mt-6">
          <GoogleSignInButton />
        </div>
      </div>
    </div>
  );
}
