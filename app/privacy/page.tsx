import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../components/Logo'

const LAST_UPDATED = 'February 23, 2026'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-6 py-12 max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center text-gray-400 hover:text-white text-sm font-medium transition mb-8"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Logo size="xs" />
          <span className="font-bold text-lg">Align and Acquire LLC</span>
        </div>
        <h1 className="text-3xl font-bold mb-1">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-10">Last Updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Introduction</h2>
            <p>
              Align &amp; Acquire LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the MissedCall AI service. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our services, including our SMS messaging programs. Please read this Privacy Policy carefully. By using our services, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Information We Collect</h2>
            <p className="mb-4">We may collect the following types of information:</p>
            <p className="mb-2">
              <strong>Personal Information:</strong> Name, phone number, email address, and business information that you voluntarily provide to us when you sign up for our services or opt in to receive SMS messages.
            </p>
            <p className="mb-2">
              <strong>Call and Message Data:</strong> Information related to phone calls handled by our system, including caller phone numbers, call timestamps, call duration, and SMS message content sent through our platform.
            </p>
            <p className="mb-2">
              <strong>Usage Data:</strong> Information about how you interact with our services, including access times, pages viewed, and the features you use.
            </p>
            <p>
              <strong>Device Information:</strong> Information about the device you use to access our services, including device type, operating system, and browser type.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">How We Use Your Information</h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, operate, and maintain our MissedCall AI services</li>
              <li>Send SMS notifications and follow-up messages related to missed calls</li>
              <li>Process and complete transactions</li>
              <li>Send administrative information, such as service updates and support messages</li>
              <li>Respond to inquiries and offer customer support</li>
              <li>Monitor and analyze usage and trends to improve our services</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">SMS Messaging</h2>
            <p className="mb-4">
              When you opt in to receive SMS messages from us or from businesses using our MissedCall AI platform, the following applies:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Message Frequency:</strong> Message frequency may vary depending on your interaction with the service.</li>
              <li><strong>Message and Data Rates:</strong> Standard message and data rates may apply.</li>
              <li><strong>Opt-Out:</strong> You may opt out of receiving SMS messages at any time by replying STOP to any message you receive from us. After opting out, you will receive one final confirmation message.</li>
              <li><strong>Help:</strong> Reply HELP to any message for assistance, or contact us at <a href="mailto:jacob@alignandacquire.com" className="text-blue-400 hover:text-blue-300 underline">jacob@alignandacquire.com</a>.</li>
              <li><strong>Consent:</strong> Consent to receive SMS messages is not a condition of purchase.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">SMS Opt-In Data and Consent Sharing</h2>
            <p className="mb-4">
              We will not share your opt-in to an SMS campaign with any third party for purposes unrelated to providing you with the services of that campaign. We may share your Personal Data, including your SMS opt-in or consent status, with third parties that help us provide our messaging services, including but not limited to platform providers, phone companies, and any other vendors who assist us in the delivery of text messages.
            </p>
            <p>
              All of the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Disclosure of Your Information</h2>
            <p className="mb-4">
              We may share information we have collected about you in certain situations. Your information may be disclosed as follows:
            </p>
            <p className="mb-2">
              <strong>Service Providers:</strong> We may share your information with third-party service providers that perform services on our behalf, such as telecommunications providers (e.g., Telnyx), hosting services, and analytics providers. These providers are contractually obligated to use your information only as necessary to provide services to us.
            </p>
            <p className="mb-2">
              <strong>Business Transfers:</strong> If we are involved in a merger, acquisition, or sale of all or a portion of our assets, your information may be transferred as part of that transaction.
            </p>
            <p className="mb-2">
              <strong>Legal Requirements:</strong> We may disclose your information where required to do so by law or in response to valid requests by public authorities (e.g., a court or government agency).
            </p>
            <p>
              <strong>Protection of Rights:</strong> We may disclose your information where we believe it is necessary to investigate, prevent, or take action regarding potential violations of our policies, suspected fraud, or situations involving potential threats to the safety of any person.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data Security</h2>
            <p>
              We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the information you provide to us, please be aware that no method of transmission over the Internet or method of electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data Retention</h2>
            <p>
              We retain your personal information only for as long as necessary to fulfill the purposes for which it was collected, including to satisfy legal, accounting, or reporting requirements. Call and messaging data is retained in accordance with applicable telecommunications regulations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Your Privacy Rights</h2>
            <p>
              Depending on your location, you may have certain rights regarding your personal information, including the right to access, correct, or delete your personal data. To exercise these rights, please contact us using the information below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Children&apos;s Privacy</h2>
            <p>
              Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children under 18.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date. You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact Us</h2>
            <p className="mb-2">
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p>
              <strong>Align &amp; Acquire LLC</strong>
              <br />
              Email: <a href="mailto:jacob@alignandacquire.com" className="text-blue-400 hover:text-blue-300 underline">jacob@alignandacquire.com</a>
            </p>
          </section>
        </div>

        <Link
          href="/"
          className="inline-flex items-center text-blue-400 hover:text-blue-300 font-medium transition mt-12"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>
      </div>
    </div>
  )
}
