"use client";

import { ClientProfileForm } from "@/components/ClientProfileForm";

export default function ClientPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Client Dashboard</h1>
      <ClientProfileForm />
    </main>
  );
}
