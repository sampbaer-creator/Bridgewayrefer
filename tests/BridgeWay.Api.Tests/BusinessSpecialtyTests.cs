using BridgeWay.Api;
using Xunit;

public class BusinessSpecialtyTests
{
    [Theory]
    [InlineData("healthcare", "Orthodontics")]
    [InlineData("healthcare", "Cardiology")]
    [InlineData("healthcare", "My custom specialty")]
    [InlineData("trades", "Plumbing")]
    [InlineData("other", "My custom business")]
    public void SignupAcceptsListedAndCustomSpecialties(string industry, string specialty)
    {
        new CustomerSignup("Practice", Industry: industry, Specialty: specialty).ValidateBusinessType();
    }

    [Theory]
    [InlineData("healthcare", "")]
    [InlineData("healthcare", "   ")]
    [InlineData("invalid", "Cardiology")]
    [InlineData(null, "Cardiology")]
    [InlineData("other", "Invalid\u0000specialty")]
    public void SignupRejectsIncompleteOrInvalidClassification(string? industry, string specialty)
    {
        Assert.Throws<ApiError>(() => new CustomerSignup("Practice", Industry: industry, Specialty: specialty).ValidateBusinessType());
    }

    [Fact]
    public void SignupRejectsOverlongSpecialty()
    {
        Assert.Throws<ApiError>(() => new CustomerSignup("Practice", Industry: "healthcare", Specialty: new string('a', 121)).ValidateBusinessType());
    }

    [Fact]
    public void OlderSignupClientsCanOmitClassification()
    {
        new CustomerSignup("Practice").ValidateBusinessType();
    }
}
