// ===========================================
// SIGN IN PAGE
// ===========================================
// Clerk's SignIn component handles all the auth logic

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignIn 
        afterSignInUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-xl",
          }
        }}
      />
    </div>
  )
}
