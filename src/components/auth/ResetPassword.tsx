import { useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { confirmPasswordResetAction } from "../../lib/auth/authClient";

const schema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof schema>;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode") || "";

  const { register, handleSubmit, formState } = useForm<ResetFormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ResetFormData) => {
    try {
      await confirmPasswordResetAction(oobCode, data.password);
      alert("Password has been reset!");
      navigate("/login");
    } catch {
      alert("Invalid or expired link.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md mx-auto">
      <input {...register("password")} placeholder="New Password" />
      <input {...register("confirmPassword")} placeholder="Confirm Password" />
      {formState.errors.confirmPassword && (
        <p>{formState.errors.confirmPassword.message}</p>
      )}
      <button>Reset Password</button>
    </form>
  );
}
