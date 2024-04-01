'use server';
 
import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
 
const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'PLEASE SELECT A CUSTOMER.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'PLEASE ENTER AN AMOUNT GREATER THAN $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'PLEASE SELECT AN INVOICE STATUS.',
  }),
  date: z.string(),
});
 
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'INVALID CREDENTIALS.';
        default:
          return 'SOMETHING WENT WRONG.';
      }
    }
    throw error;
  }
}

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  // VALIDATE FORM USING ZOD
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
 
  // IF FORM VALIDATION FAILS, RETURN ERRORS EARLY. OTHERWISE, CONTINUE.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'MISSING FIELDS. FAILED TO CREATE INVOICE.',
    };
  }
 
  // PREPARE DATA FOR INSERTION INTO THE DATABASE
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];
 
  // INSERT DATA INTO THE DATABASE
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    // IF A DATABASE ERROR OCCURS, RETURN A MORE SPECIFIC ERROR.
    return {
      message: 'DATABASE ERROR: FAILED TO CREATE INVOICE.',
    };
  }
 
  // REVALIDATE THE CACHE FOR THE INVOICES PAGE AND REDIRECT THE USER.
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
 
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'MISSING FIELDS. FAILED TO UPDATE INVOICE.',
    };
  }
 
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
 
  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    return { message: 'DATABASE ERROR: FAILED TO UPDATE INVOICE.' };
  }
 
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return { message: 'DELETED INVOICE.' };
  } catch (error) {
    return { message: 'DATABASE ERROR: FAILED TO DELETE INVOICE.' };
  }
}