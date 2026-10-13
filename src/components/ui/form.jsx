"use client";
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Controller, FormProvider, useFormContext } from "react-hook-form";

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = FormProvider

/** @type {React.Context<{ name: string } | null>} */
const FormFieldContext = React.createContext(null)

/** @template {import("react-hook-form").FieldValues} T
 * @template {import("react-hook-form").FieldPath<T>} N
 * @param {import("react-hook-form").ControllerProps<T, N>} props */
const FormField = (
  {
    ...props
  }
) => {
  return (
    (<FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>)
  );
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const form = useFormContext()
  if (!fieldContext || !itemContext || !form) {
    throw new Error("useFormField requires <Form>, <FormField>, and <FormItem>")
  }
  const { getFieldState, formState } = form
  const fieldState = getFieldState(fieldContext.name, formState)
  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

/** @type {React.Context<{ id: string } | null>} */
const FormItemContext = React.createContext(null)

const FormItem = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<"div">} props
 * @param {React.ForwardedRef<React.ElementRef<"div">>} ref */
({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    (<FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>)
  );
})
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<typeof Label>} props
 * @param {React.ForwardedRef<React.ElementRef<typeof Label>>} ref */
({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField()

  return (
    (<Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props} />)
  );
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<typeof Slot>} props
 * @param {React.ForwardedRef<React.ElementRef<typeof Slot>>} ref */
({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    (<Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props} />)
  );
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<"p">} props
 * @param {React.ForwardedRef<React.ElementRef<"p">>} ref */
({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    (<p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-[0.8rem] text-muted-foreground", className)}
      {...props} />)
  );
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<"p">} props
 * @param {React.ForwardedRef<React.ElementRef<"p">>} ref */
({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message) : children

  if (!body) {
    return null
  }

  return (
    (<p
      ref={ref}
      id={formMessageId}
      className={cn("text-[0.8rem] font-medium text-destructive", className)}
      {...props}>
      {body}
    </p>)
  );
})
FormMessage.displayName = "FormMessage"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
