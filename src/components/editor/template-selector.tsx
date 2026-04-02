"use client";

import { templates } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { useState } from "react";

interface TemplateSelectorProps {
  onSelect: (templateId: string, content: string) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [open, setOpen] = useState(false);

  function handleSelect(template: (typeof templates)[0]) {
    onSelect(template.id, template.content);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5" />}>
        <FileText className="h-4 w-4" />
        Template
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
          <DialogDescription>Start your entry with a structured template</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer transition-colors hover:bg-accent"
              onClick={() => handleSelect(template)}
            >
              <CardHeader className="p-4">
                <CardTitle className="text-sm">{template.name}</CardTitle>
                <CardDescription className="text-xs">{template.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
