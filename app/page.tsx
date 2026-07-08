import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskInbox } from "@/components/tasks/task-inbox";

export default async function DashboardPage() {
  const rep = await getCurrentRep();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {rep ? `Signed in as ${rep.displayName ?? rep.email ?? rep.id}` : "Loading…"}
          {rep?.role === "admin" ? " · admin" : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Revenue", "Paid orders", "Open issues", "Awaiting delivery"].map(
          (label) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">—</div>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {rep ? (
        <TaskInbox repId={rep.id} />
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      )}
    </div>
  );
}
