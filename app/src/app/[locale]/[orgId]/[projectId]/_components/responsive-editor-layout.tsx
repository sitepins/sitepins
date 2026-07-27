"use client";

import Container from "@/components/container";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { isConfigFile } from "@/lib/utils/is-config-file";
import { selectConfig } from "@/redux/features/config/slice";
import { TField, TState } from "@/types";
import { Tag, Text } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Dispatch, SetStateAction } from "react";
import { useSelector } from "react-redux";
import ContentEditor from "./content-editor";
import FrontmatterRenderer from "./frontmatter-renderer";

interface ResponsiveEditorLayoutProps {
  shouldShowEditor: boolean;
  schema: TField[];
  data: Record<string, any>;
  setData: Dispatch<SetStateAction<TState | undefined>>;
  filePath?: string;
  onUpdateMarkdown: (content: string) => void;
  markdownContent: string;
  onUpdateContentRef: (content: string) => void;
}

export default function ResponsiveEditorLayout({
  shouldShowEditor,
  schema,
  data,
  setData,
  filePath,
  markdownContent,
  onUpdateMarkdown,
  onUpdateContentRef,
}: ResponsiveEditorLayoutProps) {
  const tEditorTabs = useTranslations("editor.tabs");
  const isMobile = useMediaQuery("(max-width: 1535px)");
  const configFile = isConfigFile(filePath);
  const { fullscreen } = useSelector(selectConfig);

  const pathname = usePathname();

  // Mobile behavior
  if (isMobile) {
    if (configFile) {
      return (
        <div className="p-5">
          <FrontmatterRenderer
            schema={schema}
            data={data}
            setData={setData}
            showDuplicate={pathname?.includes("/configs/")}
          />
        </div>
      );
    }

    return (
      <div className="flex h-[calc(100vh-69px)] flex-col p-5 pb-0">
        <Tabs
          defaultValue="frontmatter"
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="border-border mb-4 flex h-8 w-full gap-x-2 overflow-hidden rounded-md border sm:h-9">
            <TabsTrigger value="frontmatter" asChild>
              <Button
                className="data-[state=active]:bg-primary bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-foreground h-full flex-1 rounded-sm border-none shadow-none data-[state=active]:text-white! data-[state=active]:shadow-sm"
                size="sm"
              >
                <Tag className="mr-2 size-4 text-current" />
                {tEditorTabs("frontmatter")}
              </Button>
            </TabsTrigger>
            <TabsTrigger value="content" asChild>
              <Button
                className="data-[state=active]:bg-primary bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-foreground h-full flex-1 rounded-sm border-none shadow-none data-[state=active]:text-white! data-[state=active]:shadow-sm"
                size="sm"
              >
                <Text className="mr-2 size-4 text-current" />
                {tEditorTabs("content")}
              </Button>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="frontmatter" className="min-h-0 flex-1">
            <FrontmatterRenderer
              schema={schema}
              data={data}
              setData={setData}
              showDuplicate={pathname?.includes("/configs/")}
            />
          </TabsContent>
          <TabsContent value="content" className="h-full min-h-0 flex-1">
            <ContentEditor
              markdownContent={markdownContent}
              onUpdateMarkdown={onUpdateMarkdown}
              isMobile={isMobile}
              shouldShowEditor={shouldShowEditor}
              onUpdateContentRef={onUpdateContentRef}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Desktop behavior
  if (configFile) {
    // For config files we display only the preview/frontmatter UI full-width
    return (
      <Container>
        <FrontmatterRenderer
          schema={schema}
          data={data}
          setData={setData}
          showDuplicate={pathname?.includes("/configs/")}
        />
      </Container>
    );
  }

  if (fullscreen) {
    return (
      <div className="h-[calc(100svh-70px)] p-5">
        <ContentEditor
          markdownContent={markdownContent}
          onUpdateMarkdown={onUpdateMarkdown}
          isMobile={isMobile}
          shouldShowEditor={shouldShowEditor}
          onUpdateContentRef={onUpdateContentRef}
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100svh-70px)] overflow-y-hidden">
      <ResizablePanelGroup className="h-full" orientation="horizontal">
        <ResizablePanel minSize="30%" defaultSize="40%" className="">
          <div className="h-full overflow-y-auto p-5">
            <FrontmatterRenderer
              schema={schema}
              data={data}
              setData={setData}
              showDuplicate={pathname?.includes("/configs/")}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel minSize="30%" defaultSize="60%">
          <div className="h-full p-5">
            <ContentEditor
              markdownContent={markdownContent}
              onUpdateMarkdown={onUpdateMarkdown}
              isMobile={isMobile}
              shouldShowEditor={shouldShowEditor}
              onUpdateContentRef={onUpdateContentRef}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
