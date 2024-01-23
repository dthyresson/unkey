import { CopyButton } from "@/components/dashboard/copy-button";
import { CreateKeyButton } from "@/components/dashboard/create-key-button";
import { Navbar } from "@/components/dashboard/navbar";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { getTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PropsWithChildren } from "react";

type Props = PropsWithChildren<{
  params: {
    apiId: string;
  };
}>;

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function ApiPageLayout(props: Props) {
  const tenantId = getTenantId();

  const api = await db.query.apis.findFirst({
    where: (table, { eq, and, isNull }) =>
      and(eq(table.id, props.params.apiId), isNull(table.deletedAt)),
    with: {
      workspace: true,
    },
  });
  if (!api || api.workspace.tenantId !== tenantId) {
    return notFound();
  }
  const navigation = [
    {
      label: "Overview",
      href: `/app/apis/${props.params.apiId}`,
      segment: null,
    },
    {
      label: "Keys",
      href: `/app/apis/${props.params.apiId}/keys`,
      segment: "keys",
    },
    {
      label: "Settings",
      href: `/app/apis/${props.params.apiId}/settings`,
      segment: "settings",
    },
  ];

  return (
    <div>
      <PageHeader
        title={api.name}
        description={" "}
        actions={[
          <Badge
            key="apiId"
            variant="secondary"
            className="ph-no-capture flex w-full justify-between font-mono font-medium gap-2"
          >
            {api.id}
            <CopyButton value={api.id} />
          </Badge>,
          <CreateKeyButton apiId={api.id} />,
        ]}
      />
      <div className="-mt-4 md:space-x-4 ">
        <Navbar navigation={navigation} />
      </div>
      <main className="mb-20 mt-8">{props.children}</main>
    </div>
  );
}
