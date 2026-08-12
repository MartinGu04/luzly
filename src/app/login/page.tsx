import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { APP_NAME } from "@/lib/config/productName";
import { Panel } from "@/components/ui/Panel";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Panel variant="hero" className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-foreground">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted">
          הגישה מיועדת לאנשי צוות מורשים בלבד.
        </p>
        <div className="mt-6">
          <GoogleSignInButton />
        </div>
      </Panel>
    </div>
  );
}
