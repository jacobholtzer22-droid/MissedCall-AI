import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../components/Logo'

const LAST_UPDATED = 'February 23, 2026'

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold mb-1">Terms and Conditions</h1>
        <p className="text-gray-500 text-sm mb-10">Last Updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Agreement to Terms</h2>
            <p>
              These Terms and Conditions (&quot;Terms&quot;) govern your use of the MissedCall AI service and related services provided by Align &amp; Acquire LLC (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing or using our services, you agree to be bound by these Terms. If you do not agree with any part of these Terms, you may not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Description of Services</h2>
            <p>
              Align &amp; Acquire LLC provides the MissedCall AI service, which includes automated missed call detection, call screening, call forwarding, and SMS follow-up messaging for businesses. Our services are designed to help businesses capture and respond to missed phone calls through AI-powered SMS communication.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">SMS Messaging Terms</h2>
            <p className="mb-4">
              By providing your phone number and opting in to receive text messages, you agree to the following:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You consent to receive SMS messages from the business using our MissedCall AI platform, including automated follow-up messages related to missed calls, appointment reminders, and service-related communications.</li>
              <li><strong>Message frequency may vary</strong> depending on your interactions and the services provided.</li>
              <li><strong>Standard message and data rates may apply.</strong> Contact your wireless carrier for details about your messaging plan.</li>
              <li><strong>Carriers are not liable</strong> for delayed or undelivered messages.</li>
              <li><strong>Consent is not a condition of purchase.</strong> You are not required to opt in to SMS messaging to purchase any goods or services.</li>
              <li>You may <strong>opt out at any time</strong> by replying <strong>STOP</strong> to any message. You will receive a one-time confirmation that you have been unsubscribed. After opting out, you will no longer receive SMS messages from that campaign. If you wish to re-subscribe, you may text <strong>START</strong> to opt back in.</li>
              <li>For <strong>help or support</strong>, reply <strong>HELP</strong> to any message, or contact us at jacob@alignandacquire.com.</li>
              <li>We will not share your opt-in to an SMS campaign with any third party for purposes unrelated to providing you with the services of that campaign.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Eligibility</h2>
            <p>
              You must be at least 18 years of age to use our services. By using our services, you represent and warrant that you meet this eligibility requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">User Responsibilities</h2>
            <p className="mb-4">When using our services, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Use the services only for lawful purposes</li>
              <li>Not use the services to send unsolicited or unauthorized messages</li>
              <li>Not interfere with or disrupt the services or servers connected to the services</li>
              <li>Comply with all applicable local, state, national, and international laws and regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Business Client Responsibilities</h2>
            <p className="mb-4">If you are a business using MissedCall AI services, you are responsible for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Ensuring that your use of our services complies with all applicable laws and regulations, including the Telephone Consumer Protection Act (TCPA) and CAN-SPAM Act</li>
              <li>Obtaining proper consent from your customers before they receive SMS messages through our platform</li>
              <li>Maintaining accurate and up-to-date business information</li>
              <li>Paying all applicable fees for the services in a timely manner</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Fees and Payment</h2>
            <p>
              Service fees are as outlined in your service agreement with Align &amp; Acquire LLC. We reserve the right to modify our pricing with 30 days&apos; notice. Failure to pay fees may result in suspension or termination of services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Intellectual Property</h2>
            <p>
              All content, features, and functionality of our services, including but not limited to software, text, graphics, logos, and designs, are the exclusive property of Align &amp; Acquire LLC and are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Limitation of Liability</h2>
            <p className="mb-4">
              To the fullest extent permitted by applicable law, Align &amp; Acquire LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your access to, use of, or inability to access or use our services</li>
              <li>Any conduct or content of any third party on the services</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content</li>
              <li>Any errors or omissions in message delivery, including delayed or undelivered SMS messages</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Disclaimer of Warranties</h2>
            <p>
              Our services are provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. Align &amp; Acquire LLC expressly disclaims all warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the services will be uninterrupted, timely, secure, or error-free, or that any messages will be delivered successfully.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Indemnification</h2>
            <p>
              You agree to defend, indemnify, and hold harmless Align &amp; Acquire LLC and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable attorneys&apos; fees, arising out of or in any way connected with your access to or use of the services, your violation of these Terms, or your violation of any third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Termination</h2>
            <p>
              We may terminate or suspend your access to our services immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach these Terms. Upon termination, your right to use the services will immediately cease.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Michigan, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Changes to Terms</h2>
            <p>
              We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days&apos; notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. Your continued use of our services after any changes to these Terms constitutes acceptance of those changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Severability</h2>
            <p>
              If any provision of these Terms is held to be unenforceable or invalid, such provision will be changed and interpreted to accomplish the objectives of such provision to the greatest extent possible under applicable law, and the remaining provisions will continue in full force and effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact Us</h2>
            <p className="mb-2">
              If you have questions about these Terms, please contact us at:
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
