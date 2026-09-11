import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-black">Page not found</h1>
        <p className="mt-4 text-gray-700">The page you were looking for does not exist.</p>
        <Link href="/" className="mt-6 inline-block underline underline-offset-4">
          Return home
        </Link>
      </div>
    </div>
  );
}
