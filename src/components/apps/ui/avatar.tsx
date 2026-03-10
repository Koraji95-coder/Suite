// src/components/ui/avatar.tsx

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as React from "react";
import { cn } from "@/lib/utils";
import "./ui.global.css";

type AvatarProps = React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>;
type AvatarImageProps = React.ComponentPropsWithoutRef<
	typeof AvatarPrimitive.Image
>;
type AvatarFallbackProps = React.ComponentPropsWithoutRef<
	typeof AvatarPrimitive.Fallback
>;

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
	({ className, ...props }, ref) => (
		<AvatarPrimitive.Root
			ref={ref}
			className={cn("suite-ui-avatar-root", className)}
			{...props}
		/>
	),
);
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
	({ className, ...props }, ref) => (
		<AvatarPrimitive.Image
			ref={ref}
			className={cn("suite-ui-avatar-image", className)}
			{...props}
		/>
	),
);
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
	({ className, ...props }, ref) => (
		<AvatarPrimitive.Fallback
			ref={ref}
			className={cn("suite-ui-avatar-fallback", className)}
			{...props}
		/>
	),
);
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
