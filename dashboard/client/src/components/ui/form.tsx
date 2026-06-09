import * as React from "react";
import { cn } from "@/lib/utils";

const Form = ({ className, ...props }: React.FormHTMLAttributes<HTMLFormElement>): React.JSX.Element => (
	<form className={cn("space-y-4", className)} {...props} />
);
const FormItem = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
	<div className={cn("space-y-2", className)} {...props} />
);
const FormDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element => (
	<p className={cn("text-sm text-muted-foreground", className)} {...props} />
);
const FormMessage = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element => (
	<p className={cn("text-sm font-medium text-destructive", className)} {...props} />
);
const FormControl = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
	<div className={cn("[&>*]:w-full", className)} {...props} />
);

export { Form, FormControl, FormDescription, FormItem, FormMessage };
