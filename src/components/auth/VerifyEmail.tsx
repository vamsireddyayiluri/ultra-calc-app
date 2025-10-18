import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import logo from "../../assets/logo.png";
import { send_email_verification } from "../../lib/auth/authClient";
import { useSnackbar } from "../../contexts/SnackbarProvider";

export default function VerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const { showMessage } = useSnackbar();
  const [emailBlocked, setEmailBlocked] = useState(false);

  useEffect(() => {
    const visited = localStorage.getItem("visited_verified_page");
    if (!visited) {
      localStorage.setItem("visited_verified_page", "true");
      verify();
    }

    return () => {
      localStorage.setItem("visited_verified_page", "false");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    try {
      await send_email_verification();
      showMessage(
        "Verification email sent, Please check your email to verify.",
        "success"
      );
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || "Failed to send verification email", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8EE]">
      <div
        className="flex items-center pt-8 pl-8 cursor-pointer bg-[#FFF8EE]"
        onClick={() => navigate(-1)}
      >
        <span className="mr-2">&#8592;</span> Go back
      </div>

      {/* Main Card */}
      <div className="flex justify-center items-center bg-[#FFF8EE] min-h-screen ma-x-w-md mx-auto px-4">
        <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md">
          {/* Logo */}
          <div className="flex flex-col items-center">
            <img src={logo} alt="Logo" className="w-40 mb-6 object-contain" />
            <span className="text-lg font-semibold mt-4">
              Please verify your email
            </span>
          </div>

          <div className="mt-6 text-center">
            <div>
              We've sent an email to <strong>{email}</strong>
            </div>
            <div className="mt-4">
              Please click on the link that was sent to your email address, if
              you don't see it, you may need to <strong>check your spam</strong>{" "}
              folder.
            </div>

            <div className="mt-8">
              <div>Still can't find the email?</div>
              <button
                className="mt-4 px-4 py-2 bg-teal-400 text-white rounded-sm hover:bg-teal-500"
                onClick={verify}
              >
                Resend Email
              </button>
            </div>

            {emailBlocked && (
              <div className="mt-2">
                <span
                  className="underline cursor-pointer"
                  onClick={() => navigate("/auth/verify/email")}
                >
                  Still having trouble finding your email?
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
