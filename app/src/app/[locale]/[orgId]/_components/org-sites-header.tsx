"use client";

import AddSite from "@/components/add-site";
import Search from "@/components/search";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface OrgSitesHeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  orgId: string;
  isArchived: boolean;
}

const OrgSitesHeader = ({
  searchQuery,
  setSearchQuery,
  orgId,
  isArchived,
}: OrgSitesHeaderProps) => {
  const tCommon = useTranslations("common");
  const tAddSite = useTranslations("add-site");

  return (
    <div className="mb-10 flex items-center justify-between gap-4">
      {/* Left: Search Bar */}
      <Search
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="flex-1"
        placeholder={tCommon("search_sites_placeholder")}
      />

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Add New Project */}
        <AddSite orgId={orgId} disabled={isArchived} className="h-10">
          <Plus className="mr-2 h-4 w-4" />
          {tAddSite("add_new_site")}
        </AddSite>
      </div>
    </div>
  );
};

export default OrgSitesHeader;
