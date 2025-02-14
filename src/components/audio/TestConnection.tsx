
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const TestConnection = () => {
  const { toast } = useToast();

  const handleTest = async () => {
    toast({
      title: "Testing Connection",
      description: "Attempting to connect to Hugging Face API...",
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('process-audio', {
        body: { test: true },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      console.log('Test response:', response);

      toast({
        title: "Test Complete",
        description: response.data.message,
        variant: response.data.success ? "default" : "destructive"
      });

    } catch (error) {
      console.error('Test failed:', error);
      toast({
        variant: "destructive",
        title: "Test Failed",
        description: error.message,
      });
    }
  };

  return (
    <Button
      onClick={handleTest}
      variant="secondary"
      className="w-full max-w-sm"
    >
      Test Hugging Face Connection
    </Button>
  );
};
